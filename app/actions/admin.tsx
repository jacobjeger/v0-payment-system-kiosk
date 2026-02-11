"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { sendBusinessWelcomeEmail, sendTemplateEmail, notifyMemberCardStatus, sendPasswordResetEmail, sendMemberWelcomeEmail, sendAdminWelcomeEmail } from "@/lib/email";
import { encryptCardData, decryptCardData, isEncrypted } from "@/lib/encryption";
import { hashPassword, verifyPassword } from "@/lib/password";
import { logTransactionToSheet } from "@/lib/google-sheets";
import { generateTemporaryPassword } from "@/lib/password-utils";

// Generate a random temporary password
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// =============================================================================
// TRANSACTION RECOVERY PROCEDURES
// =============================================================================

/**
 * Void a transaction - creates a reversal entry and adjusts member balance
 * Use this when a transaction was entered incorrectly or needs to be cancelled
 */
export async function createManualTransaction(data: {
  memberId: string;
  businessId: string;
  amount: number;
  description: string;
  transactionDate?: string; // ISO string for postdating
}): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient();

  try {
    // Get member details
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, balance, first_name, last_name, member_code")
      .eq("id", data.memberId)
      .single();

    if (memberError || !member) {
      return { success: false, error: "Member not found" };
    }

    // Get business name
    const { data: business } = await supabase
      .from("businesses")
      .select("name")
      .eq("id", data.businessId)
      .single();

    // Get active billing cycle
    const { data: activeCycle } = await supabase
      .from("billing_cycles")
      .select("id")
      .eq("status", "active")
      .single();

    const currentBalance = Number(member.balance);
    const newBalance = currentBalance + data.amount;

    const transactionDate = data.transactionDate
      ? new Date(data.transactionDate).toISOString()
      : new Date().toISOString();

    const { error: txError } = await supabase.from("transactions").insert({
      member_id: data.memberId,
      business_id: data.businessId,
      amount: data.amount,
      balance_before: currentBalance,
      balance_after: newBalance,
      description: data.description,
      billing_cycle_id: activeCycle?.id || null,
      created_at: transactionDate,
      source: "admin_manual",
    });

    if (txError) {
      return { success: false, error: txError.message };
    }

    // Update member balance
    await supabase
      .from("members")
      .update({ balance: newBalance })
      .eq("id", data.memberId);

    // Log to Google Sheets in background
    logTransactionToSheet({
      memberName: `${member.first_name} ${member.last_name}`,
      memberCode: member.member_code,
      businessName: business?.name || "Unknown",
      amount: data.amount,
      description: data.description,
      transactionDate,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      source: "admin_manual",
    }).catch((err) => console.error("[GoogleSheets] Admin manual error:", err));

    revalidatePath("/admin/transactions");
    revalidatePath("/admin/members");

    return { success: true };
  } catch (error) {
    console.error("Create manual transaction error:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

export async function voidTransaction(
  transactionId: string,
  reason: string,
  adminUserId?: string
): Promise<{ success: boolean; error?: string; reversalId?: string; newBalance?: number }> {
  const supabase = createAdminClient();

  try {
    const { data: result, error: rpcError } = await supabase.rpc(
      "void_transaction",
      {
        p_transaction_id: transactionId,
        p_reason: reason,
        p_admin_user_id: adminUserId || null,
      }
    );

    if (rpcError) {
      console.error("Void transaction RPC error:", rpcError);
      return { success: false, error: "Database error: " + rpcError.message };
    }

    if (!result.success) {
      return { success: false, error: result.error || "Failed to void transaction" };
    }

    revalidatePath("/admin/transactions");
    revalidatePath("/admin/members");

    return {
      success: true,
      reversalId: result.reversal_id,
      newBalance: result.new_balance,
    };
  } catch (error) {
    console.error("Void transaction error:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Recalculate member balance from transaction history
 * Use this to fix balance discrepancies by recalculating from actual transactions
 */
export async function recalculateMemberBalance(
  memberId: string
): Promise<{ success: boolean; error?: string; oldBalance?: number; newBalance?: number; transactionCount?: number }> {
  const supabase = createAdminClient();

  try {
    // Get current balance
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("id, balance")
      .eq("id", memberId)
      .single();

    if (memberError || !member) {
      return { success: false, error: "Member not found" };
    }

    const oldBalance = Number(member.balance);

    // Calculate sum of all transactions
    const { data: transactionSum, error: sumError } = await supabase
      .from("transactions")
      .select("amount")
      .eq("member_id", memberId);

    if (sumError) {
      return { success: false, error: "Failed to fetch transactions" };
    }

    // Calculate sum of all balance adjustments
    const { data: adjustmentSum, error: adjError } = await supabase
      .from("balance_adjustments")
      .select("amount")
      .eq("member_id", memberId);

    if (adjError) {
      return { success: false, error: "Failed to fetch adjustments" };
    }

    // Sum up all amounts
    const transactionTotal = transactionSum?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const adjustmentTotal = adjustmentSum?.reduce((sum, a) => sum + Number(a.amount), 0) || 0;
    const calculatedBalance = transactionTotal + adjustmentTotal;

    // Update member balance if different
    if (calculatedBalance !== oldBalance) {
      const { error: updateError } = await supabase
        .from("members")
        .update({ 
          balance: calculatedBalance, 
          updated_at: new Date().toISOString() 
        })
        .eq("id", memberId);

      if (updateError) {
        return { success: false, error: "Failed to update balance" };
      }

      // Log the correction in audit_logs
      await supabase.from("audit_logs").insert({
        table_name: "members",
        record_id: memberId,
        action: "UPDATE",
        old_data: { balance: oldBalance },
        new_data: { balance: calculatedBalance, recalculated: true },
      });
    }

    revalidatePath("/admin/members");

    return {
      success: true,
      oldBalance,
      newBalance: calculatedBalance,
      transactionCount: (transactionSum?.length || 0) + (adjustmentSum?.length || 0),
    };
  } catch (error) {
    console.error("Recalculate balance error:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Get audit log for a specific record
 */
export async function getAuditLogs(
  tableName?: string,
  recordId?: string,
  limit: number = 50
): Promise<{ success: boolean; error?: string; data?: unknown[] }> {
  const supabase = createAdminClient();

  try {
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (tableName) {
      query = query.eq("table_name", tableName);
    }
    if (recordId) {
      query = query.eq("record_id", recordId);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Get audit logs error:", error);
    return { success: false, error: "An unexpected error occurred" };
  }
}

// =============================================================================
// Admin User Management
// =============================================================================
export async function getAdminUsers() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_users")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

export async function getCurrentAdminUser() {
  // Use createClient (not createAdminClient) to get access to the session
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return { success: false, error: "Not authenticated" };
  
  // Use admin client for database operations (in case RLS restricts access)
  const adminSupabase = createAdminClient();
  
  const { data, error } = await adminSupabase
    .from("admin_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .single();

  if (error) {
    // Check if user exists by email
    const { data: byEmail } = await adminSupabase
      .from("admin_users")
      .select("*")
      .eq("email", user.email)
      .single();
    
    if (byEmail) {
      // Link the auth user to the admin record
      await adminSupabase
        .from("admin_users")
        .update({ auth_user_id: user.id })
        .eq("id", byEmail.id);
      return { success: true, data: { ...byEmail, auth_user_id: user.id } };
    }
    return { success: false, error: "Not an admin user" };
  }
  
  return { success: true, data };
}

export async function addAdminUser(data: {
  email: string;
  firstName?: string;
  lastName?: string;
  accessLevel: "super_admin" | "admin" | "manager" | "viewer";
}) {
  const supabase = createAdminClient();
  
  const { error } = await supabase.from("admin_users").insert({
    email: data.email.toLowerCase(),
    first_name: data.firstName || null,
    last_name: data.lastName || null,
    access_level: data.accessLevel,
    is_active: true,
  });

  if (error) return { success: false, error: error.message };
  
  revalidatePath("/admin/admins");
  return { success: true };
}

export async function bulkDeleteTransactions(transactionIds: string[]) {
  const supabase = createAdminClient();

  if (!transactionIds || transactionIds.length === 0) {
    return { success: false, error: "No transactions selected" };
  }

  // Delete transactions
  const { error } = await supabase
    .from("transactions")
    .delete()
    .in("id", transactionIds);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/transactions");
  revalidatePath("/admin/billing");
  return { success: true, deleted: transactionIds.length };
}

export async function resetAllSiteData() {
  const supabase = createAdminClient();

  // Delete in order to respect foreign key constraints
  // Only delete transactions, billing cycles, invoices, and email logs
  // Members, businesses, and products are preserved
  
  // 1. First, unlink invoices from members by setting member_id to null (if allowed)
  // Then delete invoices
  await supabase.from("invoices").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  
  // 2. Delete billing cycles
  await supabase.from("billing_cycles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  
  // 3. Delete transaction reviews (depends on transactions)
  await supabase.from("transaction_reviews").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  
  // 4. Unlink transactions from members/businesses first, then delete
  await supabase
    .from("transactions")
    .update({ member_id: null, business_id: null, billing_cycle_id: null })
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await supabase.from("transactions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  
  // 5. Delete email logs
  await supabase.from("email_logs").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  revalidatePath("/admin");
  revalidatePath("/admin/transactions");
  revalidatePath("/admin/billing");
  
  return { success: true };
}

export async function updateAdminUser(data: {
  accessLevel?: "super_admin" | "admin" | "manager" | "viewer";
  isActive?: boolean;
  firstName?: string;
  lastName?: string;
}, id: string) {
  const supabase = createAdminClient();
  
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.accessLevel !== undefined) updateData.access_level = data.accessLevel;
  if (data.isActive !== undefined) updateData.is_active = data.isActive;
  if (data.firstName !== undefined) updateData.first_name = data.firstName;
  if (data.lastName !== undefined) updateData.last_name = data.lastName;

  const { error } = await supabase
    .from("admin_users")
    .update(updateData)
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  
  revalidatePath("/admin/admins");
  return { success: true };
}

export async function removeAdminUser(id: string) {
  const supabase = createAdminClient();
  
  const { error } = await supabase
    .from("admin_users")
    .delete()
    .eq("id", id);

  if (error) return { success: false, error: error.message };
  
  revalidatePath("/admin/admins");
  return { success: true };
}

export async function checkAdminAccess(requiredLevel?: string[]) {
  const result = await getCurrentAdminUser();
  
  if (!result.success || !result.data) {
    return { hasAccess: false, user: null };
  }
  
  if (!result.data.is_active) {
    return { hasAccess: false, user: result.data };
  }
  
  if (requiredLevel && !requiredLevel.includes(result.data.access_level)) {
    return { hasAccess: false, user: result.data };
  }
  
  return { hasAccess: true, user: result.data };
}

// Test Data Generator
export async function generateTestTransactions(count: number = 100) {
  const supabase = createAdminClient();
  
  // Fetch all active members
  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id, balance")
    .eq("status", "active");
  
  if (membersError || !members || members.length === 0) {
    return { success: false, error: "No active members found" };
  }
  
  // Fetch all active businesses
  const { data: businesses, error: businessesError } = await supabase
    .from("businesses")
    .select("id")
    .eq("is_active", true);
  
  if (businessesError || !businesses || businesses.length === 0) {
    return { success: false, error: "No active businesses found" };
  }
  
  // Get active billing cycle
  const { data: activeCycle } = await supabase
    .from("billing_cycles")
    .select("id")
    .eq("status", "active")
    .single();
  
  const results = { created: 0, failed: 0, errors: [] as string[] };
  
  // Common transaction amounts
  const amounts = [5, 7.5, 10, 12, 15, 18, 20, 25, 30, 35, 40, 50];
  const descriptions = [
    "Lunch",
    "Coffee",
    "Snack",
    "Dinner",
    "Breakfast",
    "Drink",
    "Dessert",
    "Sandwich",
    "Salad",
    "Pizza",
    "Soup",
    "Combo meal"
  ];
  
  // Generate random transactions
  for (let i = 0; i < count; i++) {
    const member = members[Math.floor(Math.random() * members.length)];
    const business = businesses[Math.floor(Math.random() * businesses.length)];
    const amount = amounts[Math.floor(Math.random() * amounts.length)];
    const description = descriptions[Math.floor(Math.random() * descriptions.length)];
    
    // Random date within the last 30 days
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const transactionDate = new Date();
    transactionDate.setDate(transactionDate.getDate() - daysAgo);
    transactionDate.setHours(transactionDate.getHours() - hoursAgo);
    
    const currentBalance = Number(member.balance);
    const newBalance = currentBalance + amount;
    
    const { error } = await supabase.from("transactions").insert({
      member_id: member.id,
      business_id: business.id,
      amount: amount,
      balance_before: currentBalance,
      balance_after: newBalance,
      description: description,
      billing_cycle_id: activeCycle?.id || null,
      created_at: transactionDate.toISOString(),
      source: 'test_data',
      device_info: { generator: 'admin_test_data', version: '1.0' },
    });
    
    if (error) {
      results.failed++;
      if (results.errors.length < 5) {
        results.errors.push(error.message);
      }
    } else {
      results.created++;
      // Update member balance
      await supabase
        .from("members")
        .update({ balance: newBalance })
        .eq("id", member.id);
      // Update local reference
      member.balance = newBalance;
    }
  }
  
  revalidatePath("/admin/transactions");
  revalidatePath("/admin/overview");
  return { success: true, ...results };
}

// System Settings actions
export async function getSystemSetting(key: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .single();
  
  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true, value: data?.value };
}

export async function updateSystemSetting(key: string, value: unknown) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("system_settings")
    .upsert({ 
      key, 
      value, 
      updated_at: new Date().toISOString() 
    }, { onConflict: "key" });
  
  if (error) {
    return { success: false, error: error.message };
  }
  revalidatePath("/admin/settings");
  return { success: true };
}

export async function updateMemberKioskMessage(memberId: string, message: string | null) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("members")
    .update({ kiosk_message: message })
    .eq("id", memberId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  revalidatePath(`/admin/members/${memberId}`);
  return { success: true };
}

export async function approveMember(memberId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("members")
    .update({ approval_status: "approved" })
    .eq("id", memberId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  revalidatePath("/admin/members");
  return { success: true };
}

export async function rejectMember(memberId: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("members")
    .update({ approval_status: "rejected", status: "deleted" })
    .eq("id", memberId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  revalidatePath("/admin/members");
  return { success: true };
}

export async function getMemberWithDecryptedCard(id: string) {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", id)
    .single();
    
  if (error || !data) {
    return { success: false, error: error?.message || "Member not found" };
  }
  
  // Decrypt sensitive card data
  return {
    success: true,
    member: {
      ...data,
      card_number: data.card_number ? decryptCardData(data.card_number) : null,
      card_cvc: data.card_cvc ? decryptCardData(data.card_cvc) : null,
    }
  };
}

// Business actions
export async function addBusiness(data: {
  name: string;
  description?: string;
  category?: string;
  email?: string;
  username?: string;
  password?: string;
  sendWelcomeEmail?: boolean;
}) {
  const supabase = createAdminClient();

  // Check if username is already taken
  if (data.username) {
    const { data: existing } = await supabase
      .from("businesses")
      .select("id")
      .eq("username", data.username.toLowerCase())
      .single();
    
    if (existing) {
      return { success: false, error: "Username already taken" };
    }
  }

  // Generate temp password if not provided
  const tempPassword = data.password || generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const { data: business, error } = await supabase.from("businesses").insert({
    name: data.name,
    description: data.description || null,
    category: data.category || "food",
    email: data.email || null,
    username: data.username?.toLowerCase() || null,
    password_hash: passwordHash,
    must_change_password: !data.password, // Require password change if using temp password
  }).select().single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Send welcome email with login details
  if (data.sendWelcomeEmail !== false && data.email && data.username) {
    await sendBusinessWelcomeEmail(data.email, data.name, data.username, tempPassword);
  }

  revalidatePath("/admin/businesses");
  revalidatePath("/");
  return { success: true, businessId: business?.id, tempPassword: data.password ? undefined : tempPassword };
}

export async function loginBusinessWithCredentials(username: string, password: string) {
  const supabase = createAdminClient();
  
  // Find business by username
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, password_hash, is_active")
    .eq("username", username.toLowerCase())
    .is("deleted_at", null)
    .single();

  if (!business) {
    return { success: false, error: "Invalid username or password" };
  }

  if (!business.is_active) {
    return { success: false, error: "This business account is inactive" };
  }

  if (!business.password_hash) {
    return { success: false, error: "No password set for this account. Please contact admin." };
  }

  // Verify password
  const isValid = await verifyPassword(password, business.password_hash);
  if (!isValid) {
    return { success: false, error: "Invalid username or password" };
  }

  return { success: true, businessId: business.id, businessName: business.name };
}

export async function setBusinessPassword(businessId: string, password: string) {
  const supabase = createAdminClient();
  
  const passwordHash = await hashPassword(password);
  
  const { error } = await supabase
    .from("businesses")
    .update({ password_hash: passwordHash })
    .eq("id", businessId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  return { success: true };
}

export async function updateBusinessPresetAmounts(businessId: string, amounts: number[]) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("businesses")
    .update({ preset_amounts: amounts })
    .eq("id", businessId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/");
  return { success: true };
}

export async function getPopularAmountsForBusiness(businessId: string, limit: number = 6) {
  const supabase = createAdminClient();

  // Get the most common transaction amounts for this business
  const { data: transactions } = await supabase
    .from("transactions")
    .select("amount")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (!transactions || transactions.length === 0) {
    return { success: true, amounts: [5, 10, 15, 20, 25, 50] };
  }

  // Count occurrences of each rounded amount
  const amountCounts: Record<number, number> = {};
  for (const tx of transactions) {
    // Round to nearest whole number for grouping
    const rounded = Math.round(Number(tx.amount));
    if (rounded > 0) {
      amountCounts[rounded] = (amountCounts[rounded] || 0) + 1;
    }
  }

  // Sort by frequency and take top amounts
  const sortedAmounts = Object.entries(amountCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([amount]) => Number(amount))
    .sort((a, b) => a - b);

  return { success: true, amounts: sortedAmounts.length > 0 ? sortedAmounts : [5, 10, 15, 20, 25, 50] };
}

export async function bulkAddBusinesses(businesses: {
  name: string;
  description?: string;
  category?: string;
  email?: string;
  feePercentage?: number;
}[]) {
  const supabase = createAdminClient();

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const biz of businesses) {
    const { error } = await supabase.from("businesses").insert({
      name: biz.name,
      description: biz.description || null,
      category: biz.category || "food",
      email: biz.email || null,
      fee_percentage: biz.feePercentage || 0,
    });

    if (error) {
      failed++;
      errors.push(`${biz.name}: ${error.message}`);
    } else {
      success++;
    }
  }

  revalidatePath("/admin/businesses");
  return { success, failed, errors };
}

export async function toggleBusinessStatus(id: string, isActive: boolean) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("businesses")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/businesses");
  revalidatePath("/");
  return { success: true };
}

export async function updateBusiness(
  id: string,
  data: { name?: string; description?: string; category?: string }
) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("businesses")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/businesses");
  revalidatePath(`/admin/businesses/${id}`);
  return { success: true };
}

export async function updateBusinessProfile(
  id: string,
  data: { name?: string; description?: string; email?: string; phone?: string; username?: string }
) {
  const supabase = createAdminClient();

  // Check if username is already taken by another business
  if (data.username) {
    const { data: existing } = await supabase
      .from("businesses")
      .select("id")
      .eq("username", data.username.toLowerCase())
      .neq("id", id)
      .single();
    
    if (existing) {
      return { success: false, error: "Username already taken" };
    }
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description || null;
  if (data.email !== undefined) updateData.email = data.email || null;
  if (data.phone !== undefined) updateData.phone = data.phone || null;
  if (data.username !== undefined) updateData.username = data.username?.toLowerCase() || null;

  const { error } = await supabase
    .from("businesses")
    .update(updateData)
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/businesses");
  revalidatePath(`/admin/businesses/${id}`);
  return { success: true };
}

export async function createBusinessAccount(businessId: string, email: string) {
  const supabase = createAdminClient();
  
  // Get business details
  const { data: business } = await supabase
    .from("businesses")
    .select("name, username")
    .eq("id", businessId)
    .single();
  
  if (!business) {
    return { success: false, error: "Business not found" };
  }
  
  if (!business.username) {
    return { success: false, error: "Business must have a username set before creating account" };
  }
  
  // Generate temporary password
  const tempPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(tempPassword);
  
  // Update business with password hash and email (no auth_user_id needed for username-based auth)
  const { error: updateError } = await supabase
    .from("businesses")
    .update({ 
      password_hash: passwordHash,
      email,
      updated_at: new Date().toISOString() 
    })
    .eq("id", businessId);
  
  if (updateError) {
    return { success: false, error: updateError.message };
  }
  
  // Send welcome email to the business email address
  const emailResult = await sendBusinessWelcomeEmail(
    email,
    business.name,
    business.username,
    tempPassword,
    businessId
  );
  
  if (!emailResult.success) {
    console.warn(`Failed to send welcome email to ${email}: ${emailResult.error}`);
    // Don't fail account creation just because email failed
  }
  
  revalidatePath("/admin/businesses");
  revalidatePath(`/admin/businesses/${businessId}`);
  return { success: true, tempPassword };
}

export async function sendBusinessMagicLink(businessId: string, email: string) {
  const supabase = createAdminClient();
  
  // Get business details
  const { data: business } = await supabase
    .from("businesses")
    .select("name, username, password_hash")
    .eq("id", businessId)
    .single();
  
  if (!business?.password_hash) {
    return { success: false, error: "Business does not have an account yet. Create account first." };
  }

  if (!business.username) {
    return { success: false, error: "Business must have a username set." };
  }

  // Generate temporary password
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  
  // Update password hash in businesses table
  const { error: updateError } = await supabase
    .from("businesses")
    .update({ 
      password_hash: passwordHash,
      must_change_password: true 
    })
    .eq("id", businessId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  const loginLink = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/business/login`;
  
  // Send via our email system (logged to email_logs)
  const emailResult = await sendTemplateEmail(email, "login_link", {
    name: business?.name || "Business",
    email,
    login_link: loginLink,
    temp_password: tempPassword,
  }, {
    recipientType: "business",
    recipientId: businessId,
  });

  if (!emailResult.success) {
    return { success: false, error: emailResult.error || "Failed to send email" };
  }

  return { success: true };
}

export async function sendBusinessPasswordReset(businessId: string, email: string) {
  const supabase = createAdminClient();
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/business/reset-password`,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function generateBusinessTempPassword(businessId: string, email?: string) {
  const supabase = createAdminClient();
  
  // Generate a random 8-character temporary password
  const tempPassword = Math.random().toString(36).slice(-8).toUpperCase();
  
  // Check if this is a username-only business (no email)
  const { data: business } = await supabase
    .from("businesses")
    .select("username, email")
    .eq("id", businessId)
    .single();
  
  if (!business) {
    return { success: false, error: "Business not found" };
  }
  
  // For username-only accounts, hash password and store directly
  if (business.username && !business.email) {
    const hashedPassword = await hashPassword(tempPassword);
    
    const { error } = await supabase
      .from("businesses")
      .update({ 
        password_hash: hashedPassword,
        updated_at: new Date().toISOString() 
      })
      .eq("id", businessId);
    
    if (error) {
      return { success: false, error: error.message };
    }
    
    return { success: true, tempPassword };
  }
  
  // For email-based accounts, use Supabase Auth
  if (!email) {
    return { success: false, error: "Email required for auth-based accounts" };
  }
  
  const adminSupabase = createAdminClient();
  
  // Get the user by email
  const { data: user, error: userError } = await adminSupabase.auth.admin.getUserByEmail(email);
  
  if (!user || userError) {
    return { success: false, error: 'User not found' };
  }
  
  // Update the user's password and set metadata to require change
  const { error } = await adminSupabase.auth.admin.updateUserById(user.id, {
    password: tempPassword,
    user_metadata: {
      ...user.user_metadata,
      requires_password_change: true,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Update business to track temp password was issued
  await supabase
    .from("businesses")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", businessId);

  return { success: true, tempPassword };
}

export async function updateBusinessFee(id: string, feePercentage: number) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("businesses")
    .update({ fee_percentage: feePercentage, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/businesses");
  revalidatePath(`/admin/businesses/${id}`);
  revalidatePath("/admin/payouts");
  return { success: true };
}

// Password reset for both businesses and members
export async function requestPasswordReset(email: string, type: "business" | "member" = "business") {
  const supabase = createAdminClient();

  try {
    if (type === "business") {
      // Get business by email (notification_email is stored in 'email' column)
      const { data: business, error: businessError } = await supabase
        .from("businesses")
        .select("id, email, auth_user_id, username")
        .eq("email", email.toLowerCase())
        .single();

      if (businessError || !business) {
        return { success: false, error: "Business not found with this email" };
      }

      // If business has auth_user_id, use Supabase Auth for password reset
      if (business.auth_user_id) {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/business/reset-password`,
        });

        if (resetError) {
          return { success: false, error: resetError.message };
        }
      } else {
        // For username-only businesses, send a reset code via email
        const resetCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

        // Store reset code in database
        const { error: storeError } = await supabase
          .from("password_reset_tokens")
          .insert({
            email: email.toLowerCase(),
            token: resetCode,
            expires_at: expiresAt.toISOString(),
            type: "business",
          });

        if (storeError) {
          return { success: false, error: "Failed to create reset token" };
        }

        // Send email with reset code
        const resetLink = `${process.env.NEXT_PUBLIC_SITE_URL}/business/reset-password?token=${resetCode}`;
        await sendPasswordResetEmail(email, resetLink, business.username || "Business");
      }

      return { success: true, message: "Password reset link sent to your notification email" };
    } else {
      // Member password reset
      const { data: member, error: memberError } = await supabase
        .from("members")
        .select("id, email, auth_user_id, first_name, last_name")
        .eq("email", email.toLowerCase())
        .single();

      if (memberError || !member) {
        return { success: false, error: "Member not found with this email" };
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/member/reset-password`,
      });

      if (resetError) {
        return { success: false, error: resetError.message };
      }

      return { success: true, message: "Password reset link sent to your email" };
    }
  } catch (error) {
    console.error("[v0] Password reset error:", error);
    return { success: false, error: "Failed to send password reset email" };
  }
}

// Product actions
export async function addProduct(data: {
  businessId: string;
  name: string;
  description?: string;
  price: number;
  category?: string;
}) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("products").insert({
    business_id: data.businessId,
    name: data.name,
    description: data.description || null,
    price: data.price,
    category: data.category || "general",
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/businesses/${data.businessId}`);
  return { success: true };
}

export async function updateProduct(
  id: string,
  businessId: string,
  data: { name?: string; description?: string; price?: number; category?: string; is_available?: boolean }
) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("products")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  return { success: true };
}

export async function deleteProduct(id: string, businessId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  return { success: true };
}

// Bulk member upload
export async function bulkAddMembers(members: {
  firstName: string;
  lastName: string;
  email: string;
  cardNumber: string;
  cardExp: string;
  cardCvv: string;
  pinCode: string;
}[]) {
  const supabase = createAdminClient();

  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
    successDetails: [] as Array<{ name: string; email: string; tempPassword: string }>,
  };

  for (const member of members) {
    try {
      // Generate member code
      const memberCode = `MEM${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const tempPassword = Math.random().toString(36).slice(-8);
      
      // Parse expiration date (format: MM/YY) - only if provided
      let expMonth: string | null = null;
      let fullExpYear: string | null = null;
      if (member.cardExp && member.cardExp.includes("/")) {
        const [month, year] = member.cardExp.split("/");
        expMonth = month || null;
        fullExpYear = year?.length === 2 ? `20${year}` : year || null;
      }
      
      // Encrypt card data only if provided
      const encryptedCardNumber = member.cardNumber ? encryptCardData(member.cardNumber) : null;
      const encryptedCvv = member.cardCvv ? encryptCardData(member.cardCvv) : null;
      
      const memberName = member.firstName || member.lastName 
        ? `${member.firstName} ${member.lastName}`.trim() 
        : `Row ${results.success + results.failed + 1}`;
      
      const { error } = await supabase.from("members").insert({
        member_code: memberCode,
        first_name: member.firstName || null,
        last_name: member.lastName || null,
        email: member.email || null,
        pin_code: member.pinCode || null,
        card_number: encryptedCardNumber,
        card_cvc: encryptedCvv,
        card_exp_month: expMonth,
        card_exp_year: fullExpYear,
        card_last_four: member.cardNumber ? member.cardNumber.slice(-4) : null,
        balance: 0,
        status: 'active',
        is_active: true,
        approval_status: 'approved',
        pin_confirmed: false,
      });

      if (error) {
        results.failed++;
        if (error.message.includes("duplicate") || error.message.includes("unique")) {
          results.errors.push(`${memberName}: Email already exists`);
        } else {
          results.errors.push(`${memberName}: ${error.message}`);
        }
      } else {
        // Send welcome email with temporary password and PIN
        const emailHtml = `
          <h2>Welcome to PDCA, ${member.firstName}!</h2>
          <p>Your account has been created and is ready to use.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Account Details:</strong></p>
            <p><strong>Member Code:</strong> ${memberCode}</p>
            <p><strong>Email:</strong> ${member.email}</p>
            <p><strong>Temporary Password:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">${tempPassword}</code></p>
            <p><strong>Your PIN:</strong> <code style="background: #fff; padding: 2px 6px; border-radius: 3px;">${member.pinCode}</code></p>
          </div>
          <p><strong>Important:</strong></p>
          <ul>
            <li>Visit <a href="${process.env.NEXT_PUBLIC_SITE_URL}">tcpdca.com</a> to log in and update your password</li>
            <li>Use your PIN for all kiosk transactions</li>
            <li>Keep your PIN confidential</li>
          </ul>
          <p>If you have any questions, please contact support.</p>
        `;

        try {
          await sendEmail({
            to: member.email,
            subject: "Welcome to PDCA - Your Account is Ready",
            html: emailHtml,
          });
          
          results.success++;
          results.successDetails.push({
            name: memberName,
            email: member.email,
            tempPassword,
          });
        } catch (emailError) {
          results.failed++;
          results.errors.push(
            `${memberName}: Account created but failed to send email: ${emailError instanceof Error ? emailError.message : "Unknown error"}`
          );
        }
      }
    } catch (error) {
      results.failed++;
      results.errors.push(`Row error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  revalidatePath("/admin/members");
  return results;
}

// Member actions
export async function addMember(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  pinCode?: string;
  cardNumber?: string;
  cardCvc?: string;
  cardExpMonth?: string;
  cardExpYear?: string;
  cardZip?: string;
  sendWelcomeEmail?: boolean;
}) {
  const supabase = createAdminClient();

  // Generate a unique member code
  const memberCode = `M${Date.now().toString(36).toUpperCase()}`;
  
  // Generate temporary password
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const insertData: Record<string, unknown> = {
    member_code: memberCode,
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    phone: data.phone,
    balance: 0,
    pin_code: data.pinCode || null,
    password_hash: passwordHash,
    must_change_password: true,
  };

  // Encrypt card data if provided
  if (data.cardNumber) {
    insertData.card_number = encryptCardData(data.cardNumber);
    insertData.card_last_four = data.cardNumber.slice(-4);
  }
  if (data.cardCvc) {
    insertData.card_cvc = encryptCardData(data.cardCvc);
  }
  if (data.cardExpMonth) {
    insertData.card_exp_month = data.cardExpMonth;
  }
  if (data.cardExpYear) {
    insertData.card_exp_year = data.cardExpYear;
  }
  if (data.cardZip) {
    insertData.card_zip = data.cardZip;
  }

  const { data: member, error } = await supabase.from("members").insert(insertData).select().single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Send welcome email with temp password
  if (data.sendWelcomeEmail !== false && data.email) {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const loginLink = `${baseUrl}/member/login`;
    await sendTemplateEmail(
      data.email,
      "member_welcome",
      {
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        temp_password: tempPassword,
        login_link: loginLink,
      },
      {
        recipientType: "member",
        recipientId: member?.id,
      }
    );
  }

  revalidatePath("/admin/members");
  return { success: true, memberId: member?.id, tempPassword };
}

export async function updateMember(
  id: string,
  data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    isActive?: boolean;
    pinCode?: string;
    cardNumber?: string;
    cardCvc?: string;
    cardExpMonth?: string;
    cardExpYear?: string;
    cardZip?: string;
    status?: 'active' | 'paused' | 'deleted';
    pauseReason?: string;
    skipPin?: boolean;
    is_cash_collector?: boolean;
    cash_collector_pin?: string;
  }
) {
  const supabase = createAdminClient();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (data.firstName) updateData.first_name = data.firstName;
  if (data.lastName) updateData.last_name = data.lastName;
  if (data.email !== undefined) updateData.email = data.email || null;
  if (data.phone !== undefined) updateData.phone = data.phone || null;
  if (data.isActive !== undefined) updateData.is_active = data.isActive;
  if (data.pinCode !== undefined) updateData.pin_code = data.pinCode || null;
  if (data.cardNumber !== undefined) {
    updateData.card_number = data.cardNumber ? encryptCardData(data.cardNumber) : null;
    // Store last 4 digits for display
    updateData.card_last_four = data.cardNumber ? data.cardNumber.slice(-4) : null;
  }
  if (data.cardCvc !== undefined) updateData.card_cvc = data.cardCvc ? encryptCardData(data.cardCvc) : null;
  if (data.cardExpMonth !== undefined) updateData.card_exp_month = data.cardExpMonth || null;
  if (data.cardExpYear !== undefined) updateData.card_exp_year = data.cardExpYear || null;
  if (data.cardZip !== undefined) updateData.card_zip = data.cardZip || null;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.pauseReason !== undefined) updateData.pause_reason = data.pauseReason || null;
  if (data.skipPin !== undefined) updateData.skip_pin = data.skipPin;
  if (data.is_cash_collector !== undefined) updateData.is_cash_collector = data.is_cash_collector;
  if (data.cash_collector_pin !== undefined) updateData.cash_collector_pin = data.cash_collector_pin || null;

  const { error } = await supabase.from("members").update(updateData).eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${id}`);
  return { success: true };
}

export async function getDecryptedPendingCard(requestId: string) {
  const supabase = createAdminClient();
  
  const { data: request } = await supabase
    .from("pending_card_changes")
    .select("new_card_number, new_card_cvc, new_card_exp_month, new_card_exp_year, new_card_zip")
    .eq("id", requestId)
    .single();

  if (!request || !request.new_card_number) {
    return { success: false, error: "Request not found" };
  }

  // Decrypt the card data
  const cardNumber = isEncrypted(request.new_card_number) 
    ? decryptCardData(request.new_card_number) 
    : request.new_card_number;
  
  const cardCvc = request.new_card_cvc && isEncrypted(request.new_card_cvc)
    ? decryptCardData(request.new_card_cvc)
    : request.new_card_cvc;

  return {
    success: true,
    data: {
      cardNumber,
      cardCvc,
      cardExpMonth: request.new_card_exp_month,
      cardExpYear: request.new_card_exp_year,
      cardZip: request.new_card_zip,
    },
  };
}

export async function approveCardUpdate(requestId: string, adminNotes?: string) {
  const supabase = createAdminClient();

  // Get the pending request with encrypted card data
  const { data: request } = await supabase
    .from("pending_card_changes")
    .select("*, members(first_name, last_name, email)")
    .eq("id", requestId)
    .single();

  if (!request) {
    return { success: false, error: "Request not found" };
  }

  // Update the request status
  await supabase
    .from("pending_card_changes")
    .update({
      status: "resolved",
      admin_notes: adminNotes || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  // Build update data - card data is already encrypted, just copy it over
  const updateData: Record<string, string> = { card_status: "active" };
  
  if (request.request_type === "update_card" && request.new_card_number) {
    // Card data is already encrypted, just copy it over
    updateData.card_number = request.new_card_number;
    updateData.card_cvc = request.new_card_cvc || "";
    updateData.card_exp_month = request.new_card_exp_month || "";
    updateData.card_exp_year = request.new_card_exp_year || "";
    if (request.new_card_zip) {
      updateData.card_zip = request.new_card_zip;
    }
    // Extract and store last 4 digits from decrypted card number
    try {
      const decryptedCard = decryptCardData(request.new_card_number);
      if (decryptedCard && decryptedCard.length >= 4) {
        updateData.card_last_four = decryptedCard.slice(-4);
      }
    } catch (e) {
      console.error("Failed to decrypt card for last 4 digits:", e);
    }
  }
  
  await supabase
    .from("members")
    .update(updateData)
    .eq("id", request.member_id);

  // Send email notification to member
  const member = request.members as { first_name: string; last_name: string; email: string | null } | null;
  if (member?.email) {
    await notifyMemberCardStatus(
      member.email,
      `${member.first_name} ${member.last_name}`,
      "approved",
      adminNotes
    );
  }

  revalidatePath("/admin/billing/declined");
  return { success: true };
}

export async function rejectCardUpdate(requestId: string, adminNotes?: string) {
  const supabase = createAdminClient();

  // Get the pending request with member info
  const { data: request } = await supabase
    .from("pending_card_changes")
    .select("member_id, members(first_name, last_name, email)")
    .eq("id", requestId)
    .single();

  if (!request) {
    return { success: false, error: "Request not found" };
  }

  // Update the request status
  await supabase
    .from("pending_card_changes")
    .update({
      status: "still_declining",
      admin_notes: adminNotes || null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  // Set card_status back to declined
  await supabase
    .from("members")
    .update({ card_status: "declined" })
    .eq("id", request.member_id);

  // Send email notification to member
  const member = request.members as { first_name: string; last_name: string; email: string | null } | null;
  if (member?.email) {
    await notifyMemberCardStatus(
      member.email,
      `${member.first_name} ${member.last_name}`,
      "rejected",
      adminNotes
    );
  }

  revalidatePath("/admin/billing/declined");
  return { success: true };
}

export async function pauseMember(id: string, reason?: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("members")
    .update({ 
      status: 'paused', 
      pause_reason: reason || null,
      updated_at: new Date().toISOString() 
    })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${id}`);
  return { success: true };
}

export async function activateMember(id: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("members")
    .update({ 
      status: 'active', 
      pause_reason: null,
      updated_at: new Date().toISOString() 
    })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${id}`);
  return { success: true };
}

export async function deleteMember(id: string) {
  const supabase = createAdminClient();

  // Soft delete by setting status to 'deleted'
  const { error } = await supabase
    .from("members")
    .update({ 
      status: 'deleted',
      updated_at: new Date().toISOString() 
    })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/members");
  return { success: true };
}

export async function restoreMember(id: string) {
  const supabase = createAdminClient();
  
  // Restore by setting status back to 'active'
  const { error } = await supabase
    .from("members")
    .update({
      status: 'active'
    })
    .eq("id", id);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath("/admin/members");
  return { success: true };
}

export async function deleteBusiness(id: string) {
  const supabase = createAdminClient();

  // Soft delete by setting deleted_at
  const { error } = await supabase
    .from("businesses")
    .update({ 
      deleted_at: new Date().toISOString(),
      is_active: false
    })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/businesses");
  revalidatePath("/");
  return { success: true };
}

export async function createMemberAccount(memberId: string, email: string) {
  const supabase = createAdminClient();
  const adminSupabase = createAdminClient();

  // Get member name for reference
  const { data: member } = await supabase
    .from("members")
    .select("first_name, last_name")
    .eq("id", memberId)
    .single();

  // Create auth user for member using admin client
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      role: 'member',
      member_id: memberId,
    },
  });

  if (authError) {
    if (authError.message.includes('already been registered') || authError.message.includes('already exists')) {
      return { success: false, error: 'Email already in use' };
    }
    return { success: false, error: authError.message };
  }

  // Link auth user to member
  const { error: updateError } = await supabase
    .from("members")
    .update({ 
      auth_user_id: authData.user?.id,
      email,
      updated_at: new Date().toISOString() 
    })
    .eq("id", memberId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
  return { success: true };
}

// =============================================================================
// REGENERATE TEMP PASSWORD FUNCTIONS
// =============================================================================

export async function regenerateMemberPassword(memberId: string) {
  const supabase = createAdminClient();
  
  // Get member info
  const { data: member, error: fetchError } = await supabase
    .from("members")
    .select("email, first_name")
    .eq("id", memberId)
    .single();
  
  if (fetchError || !member) {
    return { success: false, error: "Member not found" };
  }
  
  // Generate new temp password
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  
  // Update password
  const { error } = await supabase
    .from("members")
    .update({ 
      password_hash: passwordHash,
      must_change_password: true 
    })
    .eq("id", memberId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  // Send email with new password
  if (member.email) {
    await sendMemberWelcomeEmail(member.email, member.first_name, tempPassword);
  }
  
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
  return { success: true, tempPassword };
}

export async function regenerateBusinessPassword(businessId: string) {
  const supabase = createAdminClient();
  
  // Get business info
  const { data: business, error: fetchError } = await supabase
    .from("businesses")
    .select("email, name, username")
    .eq("id", businessId)
    .single();
  
  if (fetchError || !business) {
    return { success: false, error: "Business not found" };
  }
  
  if (!business.username) {
    return { success: false, error: "Business has no username set" };
  }
  
  // Generate new temp password
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  
  // Update password
  const { error } = await supabase
    .from("businesses")
    .update({ 
      password_hash: passwordHash,
      must_change_password: true 
    })
    .eq("id", businessId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  // Send email with new password
  if (business.email) {
    await sendBusinessWelcomeEmail(business.email, business.name, business.username, tempPassword);
  }
  
  revalidatePath("/admin/businesses");
  revalidatePath(`/admin/businesses/${businessId}`);
  return { success: true, tempPassword };
}

export async function regenerateAdminPassword(adminId: string) {
  const supabase = createAdminClient();
  
  // Get admin info
  const { data: admin, error: fetchError } = await supabase
    .from("admin_users")
    .select("email, first_name")
    .eq("id", adminId)
    .single();
  
  if (fetchError || !admin) {
    return { success: false, error: "Admin not found" };
  }
  
  // Generate new temp password
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  
  // Update password
  const { error } = await supabase
    .from("admin_users")
    .update({ password_hash: passwordHash })
    .eq("id", adminId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  // Send email with new password
  if (admin.email) {
    await sendAdminWelcomeEmail(admin.email, admin.first_name, tempPassword);
  }
  
  revalidatePath("/admin/admins");
  return { success: true, tempPassword };
}

// =============================================================================
// PASSWORD RESET FUNCTIONS (using Resend instead of Supabase Auth emails)
// =============================================================================

export async function requestPasswordReset(
  email: string,
  userType: "member" | "business" | "admin"
) {
  const supabase = createAdminClient();
  
  console.log("[v0] requestPasswordReset called for:", email, "userType:", userType);
  
  // Check if user exists based on type
  let user: { first_name?: string; name?: string } | null = null;
  
  if (userType === "member") {
    const { data, error } = await supabase
      .from("members")
      .select("first_name")
      .eq("email", email)
      .single();
    console.log("[v0] Member lookup result:", data, "error:", error);
    user = data;
  } else if (userType === "business") {
    const { data, error } = await supabase
      .from("businesses")
      .select("name")
      .eq("email", email)
      .single();
    console.log("[v0] Business lookup result:", data, "error:", error);
    user = data;
  } else if (userType === "admin") {
    const { data, error } = await supabase
      .from("admin_users")
      .select("first_name")
      .eq("email", email)
      .single();
    console.log("[v0] Admin lookup result:", data, "error:", error);
    user = data;
  }
  
  if (!user) {
    console.log("[v0] No user found for email:", email);
    // Don't reveal if email exists or not for security
    return { success: true, message: "If an account exists with this email, you will receive a password reset link." };
  }
  
  console.log("[v0] User found, creating token...");
  
  // Generate a secure random token
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  
  // Store the token with 1 hour expiry
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  
  const { error: tokenError } = await supabase
    .from("password_reset_tokens")
    .insert({
      email,
      token,
      user_type: userType,
      expires_at: expiresAt.toISOString(),
    });
  
  if (tokenError) {
    console.error("Failed to create reset token:", tokenError);
    return { success: false, error: "Failed to create reset token" };
  }
  
  // Build the reset link (admin uses /auth/reset-password, others use /{userType}/reset-password)
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const resetPath = userType === "admin" ? "auth" : userType;
  const resetLink = `${baseUrl}/${resetPath}/reset-password?token=${token}`;
  
  console.log("[v0] Sending password reset email to:", email, "resetLink:", resetLink);
  
  // Send the email via Resend
  const firstName = userType === "business" ? user.name : user.first_name;
  const emailResult = await sendPasswordResetEmail(email, resetLink, userType, firstName);
  
  if (!emailResult.success) {
    return { success: false, error: "Failed to send reset email" };
  }
  
  return { success: true, message: "If an account exists with this email, you will receive a password reset link." };
}

export async function verifyResetToken(token: string) {
  const supabase = createAdminClient();
  
  const { data: tokenData, error } = await supabase
    .from("password_reset_tokens")
    .select("*")
    .eq("token", token)
    .is("used_at", null)
    .single();
  
  if (error || !tokenData) {
    return { valid: false, error: "Invalid or expired reset link" };
  }
  
  // Check if token has expired
  if (new Date(tokenData.expires_at) < new Date()) {
    return { valid: false, error: "This reset link has expired. Please request a new one." };
  }
  
  return { 
    valid: true, 
    email: tokenData.email, 
    userType: tokenData.user_type as "member" | "business" | "admin" 
  };
}

export async function completePasswordReset(token: string, newPassword: string) {
  const supabase = createAdminClient();
  
  // Verify the token first
  const verification = await verifyResetToken(token);
  if (!verification.valid) {
    return { success: false, error: verification.error };
  }
  
  const { email, userType } = verification;
  
  // Hash the new password
  const hashedPassword = await hashPassword(newPassword);
  
  // Update password based on user type
  if (userType === "member") {
    const { error } = await supabase
      .from("members")
      .update({ 
        password_hash: hashedPassword,
        must_change_password: false 
      })
      .eq("email", email);
    
    if (error) {
      return { success: false, error: "Failed to update password" };
    }
  } else if (userType === "business") {
    const { error } = await supabase
      .from("businesses")
      .update({ 
        password_hash: hashedPassword,
        must_change_password: false 
      })
      .eq("email", email);
    
    if (error) {
      return { success: false, error: "Failed to update password" };
    }
  } else if (userType === "admin") {
    // Admin uses Supabase Auth, so we need to update the auth.users table
    // First get the auth_user_id from admin_users
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("auth_user_id")
      .eq("email", email)
      .single();
    
    if (adminUser?.auth_user_id) {
      // Update password in Supabase Auth
      const { error } = await supabase.auth.admin.updateUserById(
        adminUser.auth_user_id,
        { password: newPassword }
      );
      
      if (error) {
        console.log("[v0] Failed to update admin password:", error);
        return { success: false, error: "Failed to update password" };
      }
    } else {
      return { success: false, error: "Admin account not properly linked" };
    }
  }
  
  // Mark the token as used
  await supabase
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("token", token);
  
  return { success: true };
}

export async function sendMemberMagicLink(memberId: string, email: string) {
  const supabase = createAdminClient();
  const adminSupabase = createAdminClient();
  
  // Get member name
  const { data: member } = await supabase
    .from("members")
    .select("first_name, last_name, auth_user_id")
    .eq("id", memberId)
    .single();
  
  if (!member?.auth_user_id) {
    return { success: false, error: "Member does not have an account yet. Create account first." };
  }

  // Generate temporary password
  const tempPassword = generateTempPassword();
  
  // Update user password in Supabase Auth
  const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
    member.auth_user_id,
    { password: tempPassword }
  );

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Set must_change_password flag
  await supabase
    .from("members")
    .update({ must_change_password: true })
    .eq("id", memberId);

  const loginLink = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/member/login`;
  
  // Send via our email system (logged to email_logs)
  const emailResult = await sendTemplateEmail(email, "login_link", {
    name: `${member.first_name} ${member.last_name}`,
    email,
    login_link: loginLink,
    temp_password: tempPassword,
  }, {
    recipientType: "member",
    recipientId: memberId,
  });
    
  if (!emailResult.success) {
    return { success: false, error: emailResult.error || "Failed to send email" };
  }

  return { success: true };
}

export async function sendMemberPasswordReset(memberId: string, email: string) {
  const supabase = createAdminClient();
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/member/reset-password`,
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true };
}

export async function bulkSendLoginInfo(memberIds: string[]) {
  const supabase = createAdminClient();
  const adminSupabase = createAdminClient();
  
  const results = {
    sent: 0,
    failed: 0,
    errors: [] as string[],
  };
  
  // Get all members with their emails and auth_user_id
  const { data: members, error } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, auth_user_id")
    .in("id", memberIds);
  
  if (error || !members) {
    return { success: false, error: "Failed to fetch members" };
  }
  
  const loginLink = `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/member/login`;
  
  for (const member of members) {
    if (!member.email) {
      results.failed++;
      results.errors.push(`${member.first_name} ${member.last_name}: No email address`);
      continue;
    }
    
    // Generate temporary password
    const tempPassword = generateTempPassword();
    
    let authUserId = member.auth_user_id;
    
    // Create auth account if it doesn't exist
    if (!authUserId) {
      const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
        email: member.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          role: "member",
          member_id: member.id,
        },
      });
      
      if (createError) {
        results.failed++;
        results.errors.push(`${member.first_name} ${member.last_name}: ${createError.message}`);
        continue;
      }
      
      authUserId = newUser.user.id;
      
      // Update member with auth_user_id
      await supabase
        .from("members")
        .update({ auth_user_id: authUserId })
        .eq("id", member.id);
    } else {
      // Update existing user's password
      const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
        authUserId,
        { password: tempPassword }
      );
      
      if (updateError) {
        results.failed++;
        results.errors.push(`${member.first_name} ${member.last_name}: ${updateError.message}`);
        continue;
      }
    }

    // Set must_change_password flag
    await supabase
      .from("members")
      .update({ must_change_password: true })
      .eq("id", member.id);
    
    // Send via our email system (logged to email_logs)
    const emailResult = await sendTemplateEmail(member.email, "login_link", {
      name: `${member.first_name} ${member.last_name}`,
      email: member.email,
      login_link: loginLink,
      temp_password: tempPassword,
    }, {
      recipientType: "member",
      recipientId: member.id,
    });
    
    if (!emailResult.success) {
      results.failed++;
      results.errors.push(`${member.first_name} ${member.last_name}: ${emailResult.error || "Email failed"}`);
    } else {
      results.sent++;
    }
  }
  
  return { success: true, ...results };
}

export async function bulkDeleteMembers(memberIds: string[]) {
  const supabase = createAdminClient();
  const adminSupabase = createAdminClient();
  
  const results = {
    deleted: 0,
    failed: 0,
    errors: [] as string[],
  };
  
  // Get all members with their auth_user_id
  const { data: members, error } = await supabase
    .from("members")
    .select("id, first_name, last_name, auth_user_id")
    .in("id", memberIds);
  
  if (error || !members) {
    return { success: false, error: "Failed to fetch members" };
  }
  
  for (const member of members) {
    // Delete auth user if exists
    if (member.auth_user_id) {
      await adminSupabase.auth.admin.deleteUser(member.auth_user_id);
    }
    
    // Delete member record
    const { error: deleteError } = await supabase
      .from("members")
      .delete()
      .eq("id", member.id);
    
    if (deleteError) {
      results.failed++;
      results.errors.push(`${member.first_name} ${member.last_name}: ${deleteError.message}`);
    } else {
      results.deleted++;
    }
  }
  
  revalidatePath("/admin/members");
  return { success: true, ...results };
}

export async function generateMemberTempPassword(memberId: string, email: string) {
  const adminSupabase = createAdminClient();
  const supabase = createAdminClient();
  
  // Generate a random 8-character temporary password
  const tempPassword = Math.random().toString(36).slice(-8).toUpperCase();
  
  // Get the user by email
  const { data: user, error: userError } = await adminSupabase.auth.admin.getUserByEmail(email);
  
  if (!user || userError) {
    return { success: false, error: 'User not found' };
  }
  
  // Update the user's password and set metadata to require change
  const { error } = await adminSupabase.auth.admin.updateUserById(user.id, {
    password: tempPassword,
    user_metadata: {
      ...user.user_metadata,
      requires_password_change: true,
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Update member to track temp password was issued
  await supabase
    .from("members")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", memberId);

  return { success: true, tempPassword };
}

// Transaction actions
export async function updateTransaction(
  transactionId: string,
  memberId: string,
  data: {
    amount?: number;
    description?: string;
  }
) {
  const supabase = createAdminClient();

  // Get the original transaction to calculate balance difference
  const { data: originalTx, error: fetchError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (fetchError || !originalTx) {
    return { success: false, error: "Transaction not found" };
  }

  const updateData: Record<string, unknown> = {};
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.description !== undefined) updateData.description = data.description;

  // Update the transaction
  const { error: updateError } = await supabase
    .from("transactions")
    .update(updateData)
    .eq("id", transactionId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // If amount changed, update member balance
  if (data.amount !== undefined && data.amount !== Number(originalTx.amount)) {
    const balanceDiff = data.amount - Number(originalTx.amount);
    
    const { data: member } = await supabase
      .from("members")
      .select("balance")
      .eq("id", memberId)
      .single();

    if (member) {
      const newBalance = Number(member.balance) + balanceDiff;
      await supabase
        .from("members")
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq("id", memberId);
    }
  }

  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/transactions");
  return { success: true };
}

export async function deleteTransaction(transactionId: string, memberId: string) {
  const supabase = createAdminClient();

  // Get the transaction to reverse the balance
  const { data: tx, error: fetchError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  if (fetchError || !tx) {
    return { success: false, error: "Transaction not found" };
  }

  // Delete the transaction
  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  // Reverse the balance change
  const { data: member } = await supabase
    .from("members")
    .select("balance")
    .eq("id", memberId)
    .single();

  if (member) {
    const newBalance = Number(member.balance) - Number(tx.amount);
    await supabase
      .from("members")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("id", memberId);
  }

  revalidatePath(`/admin/members/${memberId}`);
  revalidatePath("/admin/transactions");
  return { success: true };
}

export async function addManualTransaction(data: {
  memberId: string;
  businessId: string;
  amount: number;
  description: string;
}) {
  const supabase = createAdminClient();

  // Get current member details
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("balance, first_name, last_name, member_code")
    .eq("id", data.memberId)
    .single();

  if (memberError || !member) {
    return { success: false, error: "Member not found" };
  }

  // Get business name
  const { data: business } = await supabase
    .from("businesses")
    .select("name")
    .eq("id", data.businessId)
    .single();

  const balanceBefore = Number(member.balance);
  const balanceAfter = balanceBefore + data.amount;

  // Create the transaction
  const { error: txError } = await supabase.from("transactions").insert({
    member_id: data.memberId,
    business_id: data.businessId,
    amount: data.amount,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    description: data.description,
  });

  if (txError) {
    return { success: false, error: txError.message };
  }

  // Update member balance
  const { error: updateError } = await supabase
    .from("members")
    .update({ balance: balanceAfter, updated_at: new Date().toISOString() })
    .eq("id", data.memberId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // Log to Google Sheets in background
  logTransactionToSheet({
    memberName: `${member.first_name} ${member.last_name}`,
    memberCode: member.member_code,
    businessName: business?.name || "Unknown",
    amount: data.amount,
    description: data.description,
    transactionDate: new Date().toISOString(),
    balanceBefore,
    balanceAfter,
    source: "admin_member_page",
  }).catch((err) => console.error("[GoogleSheets] Admin member page error:", err));

  revalidatePath(`/admin/members/${data.memberId}`);
  revalidatePath("/admin/transactions");
  return { success: true };
}

/**
 * Backfill card_last_four for existing members who have encrypted card numbers
 * This is a one-time migration to populate the card_last_four column
 */
export async function backfillCardLastFour() {
  const supabase = createAdminClient();
  
  // Get all members with card_number but no card_last_four
  const { data: members, error } = await supabase
    .from("members")
    .select("id, card_number")
    .not("card_number", "is", null)
    .is("card_last_four", null);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  let updated = 0;
  let failed = 0;
  
  for (const member of members || []) {
    if (!member.card_number) continue;
    
    try {
      const decryptedCard = decryptCardData(member.card_number);
      if (decryptedCard && decryptedCard.length >= 4) {
        const lastFour = decryptedCard.slice(-4);
        const { error: updateError } = await supabase
          .from("members")
          .update({ card_last_four: lastFour })
          .eq("id", member.id);
        
        if (updateError) {
          failed++;
        } else {
          updated++;
        }
      }
    } catch (e) {
      console.error(`Failed to decrypt card for member ${member.id}:`, e);
      failed++;
    }
  }
  
  return { success: true, updated, failed, total: members?.length || 0 };
}
