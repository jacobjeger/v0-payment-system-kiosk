"use server";

import { createAdminClient } from "@/lib/supabase/server";

export async function getMemberBillForCycle(memberId: string, cycleId: string) {
  const supabase = createAdminClient();
  
  // Get the invoice for this member and cycle
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*")
    .eq("member_id", memberId)
    .eq("billing_cycle_id", cycleId)
    .single();

  if (invoiceError && invoiceError.code !== "PGRST116") {
    return { success: false, error: invoiceError.message };
  }

  // Get all transactions for this member in this cycle with business details
  // Use billing_cycle_id to match transactions (same as billing section)
  const { data: transactions, error: txError } = await supabase
    .from("transactions")
    .select(`
      id,
      amount,
      description,
      created_at,
      businesses (id, name)
    `)
    .eq("member_id", memberId)
    .eq("billing_cycle_id", cycleId)
    .order("created_at", { ascending: false });

  if (txError) {
    return { success: false, error: txError.message };
  }

  // Group transactions by business
  const businessBreakdown: Record<string, { name: string; total: number; transactions: number }> = {};
  for (const tx of transactions || []) {
    const business = tx.businesses as { id: string; name: string } | null;
    const bizId = business?.id || "unknown";
    const bizName = business?.name || "Unknown";
    if (!businessBreakdown[bizId]) {
      businessBreakdown[bizId] = { name: bizName, total: 0, transactions: 0 };
    }
    businessBreakdown[bizId].total += Number(tx.amount);
    businessBreakdown[bizId].transactions += 1;
  }

  // Get cash payments already made for this cycle
  const { data: cashPayments } = await supabase
    .from("cash_payments")
    .select("amount, created_at")
    .eq("member_id", memberId)
    .eq("billing_cycle_id", cycleId);

  const totalCashPaid = (cashPayments || []).reduce((sum, p) => sum + Number(p.amount), 0);
  const grandTotal = (transactions || []).reduce((sum, tx) => sum + Number(tx.amount), 0);
  const amountOwed = grandTotal - totalCashPaid;

  return {
    success: true,
    data: {
      invoice,
      grandTotal,
      totalCashPaid,
      amountOwed,
      businessBreakdown: Object.values(businessBreakdown),
      transactionCount: transactions?.length || 0,
    },
  };
}

export async function searchMembersForCashCollection(query: string) {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, card_last_four, is_active")
    .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
    .eq("is_active", true)
    .order("first_name")
    .limit(20);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function recordCashPayment(data: {
  memberId: string;
  cycleId: string;
  amount: number;
  collectorMemberId?: string;
  collectorAdminId?: string;
  notes?: string;
  isFullPayment?: boolean;
  paymentType?: "cash" | "zelle";
}) {
  const supabase = createAdminClient();

  // Get or create invoice for this member/cycle
  let invoiceId: string | null = null;
  
  const { data: existingInvoice } = await supabase
    .from("invoices")
    .select("id, total_amount")
    .eq("member_id", data.memberId)
    .eq("billing_cycle_id", data.cycleId)
    .single();

  invoiceId = existingInvoice?.id || null;

  // Insert the cash payment record
  const { error } = await supabase.from("cash_payments").insert({
    invoice_id: invoiceId,
    member_id: data.memberId,
    billing_cycle_id: data.cycleId,
    amount: data.amount,
    collected_by_member_id: data.collectorMemberId || null,
    collected_by_admin_id: data.collectorAdminId || null,
    payment_type: data.paymentType || "cash",
    notes: data.notes,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // If we have an invoice, update its payment status
  if (invoiceId) {
    // Get total cash payments for this invoice
    const { data: payments } = await supabase
      .from("cash_payments")
      .select("amount")
      .eq("invoice_id", invoiceId);
    
    const totalCashPaid = (payments || []).reduce((sum, p) => sum + Number(p.amount), 0);
    const invoiceTotal = Number(existingInvoice?.total_amount || 0);
    
    // Update payment status based on amount paid
    if (data.isFullPayment || totalCashPaid >= invoiceTotal) {
      // Fully paid
      await supabase
        .from("invoices")
        .update({ 
          payment_status: "paid_cash",
          status: "paid_cash"
        })
        .eq("id", invoiceId);
    } else if (totalCashPaid > 0) {
      // Partial payment
      await supabase
        .from("invoices")
        .update({ 
          payment_status: "partial_cash",
          status: "partial_cash"
        })
        .eq("id", invoiceId);
    }
  }

  return { success: true };
}

export async function getLastClosedBillingCycle() {
  const supabase = createAdminClient();
  
  // Get the most recently closed billing cycle (by created_at to get the latest cycle number)
  const { data, error } = await supabase
    .from("billing_cycles")
    .select("*")
    .eq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function getAllMembersForCashCollection() {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, card_last_four, pin_code, is_active")
    .eq("is_active", true)
    .order("first_name");

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function updateMemberPin(memberId: string, newPin: string) {
  const supabase = createAdminClient();
  
  // Validate PIN is 4 digits
  if (!/^\d{4}$/.test(newPin)) {
    return { success: false, error: "PIN must be exactly 4 digits" };
  }
  
  const { error } = await supabase
    .from("members")
    .update({ pin_code: newPin, updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function checkIsCashCollector(memberId: string) {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from("members")
    .select("is_cash_collector")
    .eq("id", memberId)
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, isCashCollector: data?.is_cash_collector || false };
}

export async function getCashPaymentsForCycle(cycleId: string) {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from("cash_payments")
    .select(`
      id,
      amount,
      payment_type,
      notes,
      created_at,
      member_id,
      invoice_id,
      collected_by_member:members!cash_payments_collected_by_member_id_fkey(id, first_name, last_name),
      collected_by_admin:admin_users!cash_payments_collected_by_admin_id_fkey(id, name, email)
    `)
    .eq("billing_cycle_id", cycleId)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data };
}

export async function recordAdminPayment(data: {
  memberId: string;
  cycleId: string;
  amount: number;
  adminId: string;
  paymentType: "cash" | "zelle";
  notes?: string;
}) {
  return recordCashPayment({
    memberId: data.memberId,
    cycleId: data.cycleId,
    amount: data.amount,
    collectorAdminId: data.adminId,
    paymentType: data.paymentType,
    notes: data.notes,
  });
}
