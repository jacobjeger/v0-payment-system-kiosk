"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { logTransactionToSheet } from "@/lib/google-sheets";

interface ProcessTransactionInput {
  memberId: string;
  businessId: string;
  amount: number;
  description?: string;
  comment?: string;
  source?: 'kiosk' | 'business_portal' | 'admin_panel' | 'api' | 'test_data';
  deviceInfo?: {
    userAgent?: string;
    platform?: string;
    screenWidth?: number;
    screenHeight?: number;
    language?: string;
    timezone?: string;
  };
  createdByUserId?: string;
}

interface TransactionResult {
  success: boolean;
  error?: string;
  newBalance?: number;
  transactionId?: string;
}

export async function processTransaction(
  input: ProcessTransactionInput
): Promise<TransactionResult> {
  const supabase = createAdminClient();

  try {
    // Get current active billing cycle
    const { data: activeCycle } = await supabase
      .from("billing_cycles")
      .select("id")
      .eq("status", "active")
      .single();

    // Use atomic database function with row-level locking
    // This prevents race conditions when two kiosks process the same member simultaneously
    const { data: result, error: rpcError } = await supabase.rpc(
      "process_kiosk_transaction",
      {
        p_member_id: input.memberId,
        p_business_id: input.businessId,
        p_amount: input.amount,
        p_description: input.description || null,
        p_notes: input.comment || null,
        p_billing_cycle_id: activeCycle?.id || null,
        p_source: input.source || "kiosk",
        p_device_info: input.deviceInfo || {},
        p_ip_address: null,
      }
    );

    if (rpcError) {
      console.error("RPC error:", rpcError);
      return { success: false, error: "Database error: " + rpcError.message };
    }

    // The RPC function returns a JSONB object with success, error, transaction_id, etc.
    if (!result.success) {
      return { success: false, error: result.error || "Transaction failed" };
    }

    // Auto-update preset amounts in background (don't await to keep response fast)
    updatePresetAmountsIfNeeded(input.businessId, input.amount, supabase).catch(console.error);

    // Log to Google Sheets in background (don't block transaction response)
    (async () => {
      try {
        const { data: member } = await supabase
          .from("members")
          .select("first_name, last_name, member_code")
          .eq("id", input.memberId)
          .single();

        const { data: business } = await supabase
          .from("businesses")
          .select("name")
          .eq("id", input.businessId)
          .single();

        await logTransactionToSheet({
          memberName: member ? `${member.first_name} ${member.last_name}` : "Unknown",
          memberCode: member?.member_code || "Unknown",
          businessName: business?.name || "Unknown",
          amount: input.amount,
          description: input.description || "",
          transactionDate: new Date().toISOString(),
          balanceBefore: result.balance_before,
          balanceAfter: result.balance_after,
          source: input.source || "kiosk",
        });
      } catch (err) {
        console.error("Failed to log to Google Sheets:", err);
      }
    })();

    return {
      success: true,
      newBalance: result.balance_after,
      transactionId: result.transaction_id,
    };
  } catch (error) {
    console.error("Transaction error:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

// Helper function to auto-update preset amounts based on transaction history
async function updatePresetAmountsIfNeeded(
  businessId: string,
  transactionAmount: number,
  supabase: Awaited<ReturnType<typeof createAdminClient>>
) {
  try {
    // Get business settings
    const { data: business } = await supabase
      .from("businesses")
      .select("preset_amounts, auto_update_preset_amounts, preset_amounts_threshold, max_preset_amounts")
      .eq("id", businessId)
      .single();

    if (!business?.auto_update_preset_amounts) return;

    const currentPresets: number[] = business.preset_amounts || [5, 10, 15, 20, 25, 50];
    const threshold = business.preset_amounts_threshold || 5;
    const maxPresets = business.max_preset_amounts || 9;

    // Round amount to nearest whole number for comparison
    const roundedAmount = Math.round(transactionAmount);
    
    // If this amount is already in presets, no need to check
    if (currentPresets.includes(roundedAmount)) return;

    // Count how many times this amount has been used recently (last 100 transactions)
    const { data: recentTransactions } = await supabase
      .from("transactions")
      .select("amount")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!recentTransactions) return;

    // Count occurrences of this rounded amount
    const amountCount = recentTransactions.filter(
      (t) => Math.round(Number(t.amount)) === roundedAmount
    ).length;

    // If this amount is used frequently enough, add it to presets
    if (amountCount >= threshold) {
      // Add new amount and sort
      let newPresets = [...currentPresets, roundedAmount].sort((a, b) => a - b);
      
      // If we exceed max presets, remove the least used one
      if (newPresets.length > maxPresets) {
        // Find the least frequently used preset
        const presetCounts: Record<number, number> = {};
        for (const preset of newPresets) {
          presetCounts[preset] = recentTransactions.filter(
            (t) => Math.round(Number(t.amount)) === preset
          ).length;
        }
        
        // Find preset with lowest count (but never remove the new one we're adding)
        let minCount = Infinity;
        let presetToRemove = newPresets[0];
        for (const preset of newPresets) {
          if (preset !== roundedAmount && presetCounts[preset] < minCount) {
            minCount = presetCounts[preset];
            presetToRemove = preset;
          }
        }
        
        newPresets = newPresets.filter((p) => p !== presetToRemove);
      }

      // Update business preset amounts
      await supabase
        .from("businesses")
        .update({ preset_amounts: newPresets })
        .eq("id", businessId);
    }
  } catch (error) {
    // Silent fail - don't break transactions if preset update fails
    console.error("Error updating preset amounts:", error);
  }
}

export async function addBalanceAdjustment(input: {
  memberId: string;
  amount: number;
  adjustmentType: "deposit" | "withdrawal" | "correction";
  notes?: string;
  adminUserId?: string;
}): Promise<{ success: boolean; error?: string; newBalance?: number }> {
  const supabase = createAdminClient();

  try {
    // Use atomic database function with row-level locking
    const { data: result, error: rpcError } = await supabase.rpc(
      "admin_adjust_balance",
      {
        p_member_id: input.memberId,
        p_amount: input.amount,
        p_adjustment_type: input.adjustmentType,
        p_notes: input.notes || null,
        p_admin_user_id: input.adminUserId || null,
      }
    );

    if (rpcError) {
      console.error("RPC error:", rpcError);
      return { success: false, error: "Database error: " + rpcError.message };
    }

    if (!result.success) {
      return { success: false, error: result.error || "Adjustment failed" };
    }

    return { success: true, newBalance: result.balance_after };
  } catch (error) {
    console.error("Adjustment error:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}
