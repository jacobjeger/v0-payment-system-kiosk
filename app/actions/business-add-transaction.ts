"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logTransactionToSheet } from "@/lib/google-sheets";

export async function businessAddTransaction(data: {
  businessId: string;
  memberId: string;
  amount: number;
  description?: string;
}) {
  const supabase = createAdminClient();

  // Verify business has permission to add transactions
  const { data: business } = await supabase
    .from("businesses")
    .select("name, can_add_transactions, is_active")
    .eq("id", data.businessId)
    .single();

  if (!business) {
    return { success: false, error: "Business not found" };
  }

  if (!business.can_add_transactions) {
    return { success: false, error: "Business does not have permission to add transactions" };
  }

  if (!business.is_active) {
    return { success: false, error: "Business is not active" };
  }

  // Get active billing cycle
  const { data: activeCycle } = await supabase
    .from("billing_cycles")
    .select("id")
    .eq("status", "active")
    .single();

  if (!activeCycle) {
    return { success: false, error: "No active billing cycle found" };
  }

  // Get member's current balance
  const { data: member } = await supabase
    .from("members")
    .select("balance, first_name, last_name, member_code")
    .eq("id", data.memberId)
    .single();

  if (!member) {
    return { success: false, error: "Member not found" };
  }

  const balanceBefore = member.balance || 0;
  const balanceAfter = balanceBefore + data.amount;

  // Create transaction
  const { data: transaction, error } = await supabase
    .from("transactions")
    .insert({
      business_id: data.businessId,
      member_id: data.memberId,
      amount: data.amount,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      description: data.description || "Manual entry by business",
      billing_cycle_id: activeCycle.id,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Update member's balance
  await supabase
    .from("members")
    .update({ balance: balanceAfter })
    .eq("id", data.memberId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Log to Google Sheets in background
  logTransactionToSheet({
    memberName: `${member.first_name} ${member.last_name}`,
    memberCode: member.member_code,
    businessName: business.name,
    amount: data.amount,
    description: data.description || "Manual entry by business",
    transactionDate: new Date().toISOString(),
    balanceBefore,
    balanceAfter,
    source: "business_portal",
  }).catch((err) => console.error("[GoogleSheets] Business portal error:", err));

  revalidatePath("/business/dashboard");
  revalidatePath("/business/transactions");

  return { success: true, transaction };
}
