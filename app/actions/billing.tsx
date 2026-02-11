"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  encryptCardData,
  decryptCardData,
  isEncrypted,
} from "@/lib/encryption";
import { sendCustomEmail } from "@/lib/email";

export async function getInvoiceEmailStatus(invoiceId: string, memberEmail: string) {
  const supabase = createAdminClient();
  
  // Look for the most recent invoice email sent to this member
  const { data } = await supabase
    .from("email_logs")
    .select("*")
    .eq("to_email", memberEmail)
    .or("template_key.eq.invoice,subject.ilike.%Invoice%")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data;
}

export async function deleteBillingCycle(cycleId: string) {
  const supabase = createAdminClient();

  // Check if cycle exists
  const { data: cycle } = await supabase
    .from("billing_cycles")
    .select("id, status")
    .eq("id", cycleId)
    .single();

  if (!cycle) {
    return { success: false, error: "Cycle not found" };
  }

  // Get all transactions for this cycle (need IDs for disputes and member_ids for balance recalc)
  const { data: cycleTransactions } = await supabase
    .from("transactions")
    .select("id, member_id, amount")
    .eq("billing_cycle_id", cycleId);

  // Delete associated invoices first
  await supabase
    .from("invoices")
    .delete()
    .eq("billing_cycle_id", cycleId);

  // Delete cash payments associated with this cycle
  await supabase
    .from("cash_payments")
    .delete()
    .eq("billing_cycle_id", cycleId);

  // Delete transaction disputes first (foreign key constraint)
  if (cycleTransactions && cycleTransactions.length > 0) {
    const transactionIds = cycleTransactions.map(t => t.id);
    await supabase
      .from("transaction_disputes")
      .delete()
      .in("transaction_id", transactionIds);
  }

  // Delete transactions for this cycle
  await supabase
    .from("transactions")
    .delete()
    .eq("billing_cycle_id", cycleId);

  // Recalculate member balances
  if (cycleTransactions && cycleTransactions.length > 0) {
    const affectedMemberIds = [...new Set(cycleTransactions.map(t => t.member_id))];
    
    for (const memberId of affectedMemberIds) {
      // Calculate new balance from remaining transactions
      const { data: remainingTransactions } = await supabase
        .from("transactions")
        .select("amount")
        .eq("member_id", memberId)
        .order("created_at", { ascending: true });

      const newBalance = remainingTransactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;

      // Update member balance
      await supabase
        .from("members")
        .update({ balance: newBalance })
        .eq("id", memberId);
    }
  }

  // Delete the cycle
  const { error } = await supabase
    .from("billing_cycles")
    .delete()
    .eq("id", cycleId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/billing");
  revalidatePath("/admin/billing/cycles");
  return { success: true };
}

export async function createBillingCycle(data: {
  name: string;
}) {
  const supabase = createAdminClient();

  // Check if there's an active cycle and close it first
  const { data: activeCycle } = await supabase
    .from("billing_cycles")
    .select("id")
    .eq("status", "active")
    .single();

  if (activeCycle) {
    // Close the active cycle (generate invoices)
    await closeBillingCycle(activeCycle.id);
  }

  // Create new cycle - use today as start date
  const today = new Date().toISOString().split("T")[0];
  
  const { data: cycle, error } = await supabase
    .from("billing_cycles")
    .insert({
      name: data.name,
      start_date: today,
      end_date: today, // Will be updated when closed
      status: "active",
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/billing");
  return { success: true, cycleId: cycle?.id, closedPreviousCycle: !!activeCycle };
}

export async function closeBillingCycle(cycleId: string) {
  const supabase = createAdminClient();

  // Get the cycle details
  const { data: cycle } = await supabase
    .from("billing_cycles")
    .select("*")
    .eq("id", cycleId)
    .single();

  if (!cycle) {
    return { success: false, error: "Billing cycle not found" };
  }

  const today = new Date().toISOString().split("T")[0];

  // Get all transactions that belong to this billing cycle
  const { data: transactions } = await supabase
    .from("transactions")
    .select("member_id, amount")
    .eq("billing_cycle_id", cycleId);

  if (!transactions || transactions.length === 0) {
    // Update cycle status even if no transactions
    await supabase
      .from("billing_cycles")
      .update({ 
        status: "closed", 
        end_date: today,
        closed_at: new Date().toISOString() 
      })
      .eq("id", cycleId);

    revalidatePath("/admin/billing");
    return { success: true, invoiceCount: 0 };
  }

  // Get all businesses with their owners for offset calculation
  const { data: businessesWithOwners } = await supabase
    .from("businesses")
    .select("id, owner_member_id")
    .not("owner_member_id", "is", null);

  const ownerBusinessMap = new Map<string, string[]>();
  if (businessesWithOwners) {
    businessesWithOwners.forEach(b => {
      if (b.owner_member_id) {
        if (!ownerBusinessMap.has(b.owner_member_id)) {
          ownerBusinessMap.set(b.owner_member_id, []);
        }
        ownerBusinessMap.get(b.owner_member_id)!.push(b.id);
      }
    });
  }

  // Group transactions by member
  const memberTotals: Record<string, { total: number; count: number }> = {};
  for (const tx of transactions) {
    if (!memberTotals[tx.member_id]) {
      memberTotals[tx.member_id] = { total: 0, count: 0 };
    }
    memberTotals[tx.member_id].total += Number(tx.amount);
    memberTotals[tx.member_id].count += 1;
  }

  // Create invoices for each member and apply owner offsets
  const invoices = [];
  const offsetTransactions = [];

  for (const [memberId, data] of Object.entries(memberTotals)) {
    let invoiceAmount = data.total;
    
    // Check if this member is a business owner - if so, deduct their balance from the invoice
    if (ownerBusinessMap.has(memberId)) {
      const { data: member } = await supabase
        .from("members")
        .select("balance")
        .eq("id", memberId)
        .single();

      if (member && member.balance > 0) {
        const offsetAmount = Math.min(invoiceAmount, member.balance);
        invoiceAmount -= offsetAmount;

        // Record the offset as a special transaction for audit
        offsetTransactions.push({
          member_id: memberId,
          business_id: null,
          amount: -offsetAmount,
          balance_before: member.balance,
          balance_after: member.balance - offsetAmount,
          description: `Owner offset applied during billing cycle ${cycle.name}`,
          source: "admin_panel",
          billing_cycle_id: cycleId,
          created_at: new Date().toISOString(),
        });
      }
    }

    invoices.push({
      billing_cycle_id: cycleId,
      member_id: memberId,
      total_amount: invoiceAmount,
      transaction_count: data.count,
      status: "pending",
    });
  }

  const { error: invoiceError } = await supabase.from("invoices").insert(invoices);

  if (invoiceError) {
    return { success: false, error: invoiceError.message };
  }

  // Record offset transactions for audit trail
  if (offsetTransactions.length > 0) {
    await supabase.from("transactions").insert(offsetTransactions);
  }

  // Reset balances to 0 for all members who had transactions in this cycle
  const memberIds = Object.keys(memberTotals);
  if (memberIds.length > 0) {
    const { error: resetError } = await supabase
      .from("members")
      .update({ 
        balance: 0, 
        updated_at: new Date().toISOString() 
      })
      .in("id", memberIds);

    if (resetError) {
      console.error("Failed to reset member balances:", resetError);
    }
  }

  // Update cycle status with end date
  await supabase
    .from("billing_cycles")
    .update({ 
      status: "closed", 
      end_date: today,
      closed_at: new Date().toISOString() 
    })
    .eq("id", cycleId);

  revalidatePath("/admin/billing");
  revalidatePath("/admin/members");
  revalidatePath(`/admin/billing/cycles/${cycleId}`);
  return { success: true, invoiceCount: invoices.length };
}

/**
 * Manually reset all member balances to 0
 * Use this after closing a billing cycle if balances weren't reset
 */
export async function resetAllMemberBalances() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("members")
    .update({ 
      balance: 0, 
      updated_at: new Date().toISOString() 
    })
    .neq("balance", 0)
    .select("id");

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/members");
  revalidatePath("/admin");
  return { success: true, resetCount: data?.length || 0 };
}

export async function getBillingCycleWithInvoices(cycleId: string) {
  const supabase = createAdminClient();

  const { data: cycle } = await supabase
    .from("billing_cycles")
    .select("*")
    .eq("id", cycleId)
    .single();

  if (!cycle) {
    return null;
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      *,
      member:members(id, first_name, last_name, email, phone)
    `)
    .eq("billing_cycle_id", cycleId)
    .order("total_amount", { ascending: false });

  // Fetch all cash payments for this billing cycle with collector info
  const { data: cashPayments } = await supabase
    .from("cash_payments")
    .select(`
      id,
      invoice_id, 
      member_id, 
      amount,
      payment_type,
      notes,
      created_at,
      collected_by_member_id,
      collected_by_admin_id
    `)
    .eq("billing_cycle_id", cycleId);

  // Fetch collector names separately
  const memberCollectorIds = [...new Set((cashPayments || []).filter(p => p.collected_by_member_id).map(p => p.collected_by_member_id))];
  const adminCollectorIds = [...new Set((cashPayments || []).filter(p => p.collected_by_admin_id).map(p => p.collected_by_admin_id))];

  const { data: memberCollectors } = memberCollectorIds.length > 0 
    ? await supabase.from("members").select("id, first_name, last_name").in("id", memberCollectorIds)
    : { data: [] };

  const { data: adminCollectors } = adminCollectorIds.length > 0
    ? await supabase.from("admin_users").select("id, name, email").in("id", adminCollectorIds)
    : { data: [] };

  const memberCollectorMap = new Map((memberCollectors || []).map(m => [m.id, `${m.first_name} ${m.last_name}`]));
  const adminCollectorMap = new Map((adminCollectors || []).map(a => [a.id, a.name || a.email]));

  // Group cash payments by member_id with payment details
  const paymentsByMember = new Map<string, { 
    total: number; 
    payments: Array<{ 
      amount: number; 
      type: string; 
      collectedBy: string; 
      date: string;
      notes?: string;
    }> 
  }>();
  
  for (const payment of cashPayments || []) {
    if (payment.member_id) {
      const existing = paymentsByMember.get(payment.member_id) || { total: 0, payments: [] };
      const collectedBy = payment.collected_by_admin_id 
        ? adminCollectorMap.get(payment.collected_by_admin_id) || "Admin"
        : payment.collected_by_member_id 
          ? memberCollectorMap.get(payment.collected_by_member_id) || "Member"
          : "Unknown";
      
      existing.total += Number(payment.amount);
      existing.payments.push({
        amount: Number(payment.amount),
        type: payment.payment_type || "cash",
        collectedBy,
        date: payment.created_at,
        notes: payment.notes || undefined,
      });
      paymentsByMember.set(payment.member_id, existing);
    }
  }

  // Add amount_paid, amount_owed, and payment_details to each invoice
  const invoicesWithPayments = (invoices || []).map(invoice => {
    const paymentData = paymentsByMember.get(invoice.member_id) || { total: 0, payments: [] };
    const amount_paid = paymentData.total;
    const amount_owed = Math.max(0, Number(invoice.total_amount) - amount_paid);
    
    return {
      ...invoice,
      amount_paid,
      amount_owed,
      payment_details: paymentData.payments,
    };
  });

  return { cycle, invoices: invoicesWithPayments };
}

export async function getInvoiceTransactions(invoiceId: string) {
  const supabase = createAdminClient();

  // Get the invoice with cycle info
  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      *,
      member:members(id, first_name, last_name, email),
      billing_cycle:billing_cycles(id, start_date, end_date)
    `)
    .eq("id", invoiceId)
    .single();

  if (!invoice || !invoice.billing_cycle) {
    return null;
  }

  // Get transactions for this member in this billing cycle
  const { data: transactions } = await supabase
    .from("transactions")
    .select(`
      *,
      business:businesses(name)
    `)
    .eq("member_id", invoice.member_id)
    .eq("billing_cycle_id", invoice.billing_cycle_id)
    .order("created_at", { ascending: false });

  return { invoice, transactions: transactions || [] };
}

export async function updateTransaction(
  transactionId: string,
  data: { amount?: number; description?: string }
) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("transactions")
    .update(data)
    .eq("id", transactionId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/billing");
  return { success: true };
}

export async function deleteTransaction(transactionId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/billing");
  return { success: true };
}

export async function recalculateInvoice(invoiceId: string) {
  const supabase = createAdminClient();

  const result = await getInvoiceTransactions(invoiceId);
  if (!result) {
    return { success: false, error: "Invoice not found" };
  }

  const total = result.transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);

  const { error } = await supabase
    .from("invoices")
    .update({
      total_amount: total,
      transaction_count: result.transactions.length,
    })
    .eq("id", invoiceId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/billing");
  return { success: true, newTotal: total };
}

export async function updateInvoiceMessage(invoiceId: string, message: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("invoices")
    .update({ email_message: message })
    .eq("id", invoiceId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function updateAllInvoiceMessages(cycleId: string, message: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("invoices")
    .update({ email_message: message })
    .eq("billing_cycle_id", cycleId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/billing/cycles/${cycleId}`);
  return { success: true };
}

export async function sendInvoiceEmail(invoiceId: string) {
  const supabase = createAdminClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(`
      *,
      member:members(first_name, last_name, email),
      billing_cycle:billing_cycles(name, start_date, end_date)
    `)
    .eq("id", invoiceId)
    .single();

  if (!invoice || !invoice.member?.email) {
    return { success: false, error: "Invoice or member email not found" };
  }

  const member = invoice.member;
  const cycle = invoice.billing_cycle;

  // Get transactions for the invoice
  const result = await getInvoiceTransactions(invoiceId);
  const transactions = result?.transactions || [];

  const emailHtml = generateInvoiceEmailHtml({
    memberName: `${member.first_name} ${member.last_name}`,
    cycleName: cycle?.name || "Billing Cycle",
    startDate: cycle?.start_date || "",
    endDate: cycle?.end_date || "",
    totalAmount: invoice.total_amount,
    customMessage: invoice.email_message,
    transactions,
  });

  const emailResult = await sendCustomEmail(
    member.email,
    `Invoice: ${cycle?.name || "Billing Statement"}`,
    emailHtml,
    {
      recipientType: "member",
      recipientId: invoice.member_id,
    }
  );

  if (!emailResult.success) {
    return { success: false, error: emailResult.error };
  }

  // Update invoice status and record email event
  await supabase
    .from("invoices")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      email_sent_to: member.email,
    })
    .eq("id", invoiceId);

  await supabase.from("invoice_emails").insert({
    invoice_id: invoiceId,
    resend_id: emailResult.id || null,
    event_type: "sent",
  });

  revalidatePath("/admin/billing");
  return { success: true, emailId: emailResult.id };
}

// Alias for backwards compatibility
export const sendInvoicesForCycle = sendAllInvoices;

export async function sendAllInvoices(cycleId: string) {
  const supabase = createAdminClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("billing_cycle_id", cycleId)
    .eq("status", "pending");

  if (!invoices || invoices.length === 0) {
    return { success: true, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const invoice of invoices) {
    const result = await sendInvoiceEmail(invoice.id);
    if (result.success) {
      sent++;
    } else {
      failed++;
    }
    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // Update cycle status to invoiced
  await supabase
    .from("billing_cycles")
    .update({ status: "invoiced" })
    .eq("id", cycleId);

  revalidatePath("/admin/billing");
  revalidatePath(`/admin/billing/cycles/${cycleId}`);
  return { success: true, sent, failed };
}

export async function markInvoiceAsPaidCash(invoiceId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("invoices")
    .update({ status: "paid_cash" })
    .eq("id", invoiceId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/billing");
  return { success: true };
}

export async function markAllAsPaidCash(cycleId: string, invoiceIds: string[]) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("invoices")
    .update({ 
      status: "paid_cash", 
      payment_status: "paid_cash" 
    })
    .in("id", invoiceIds);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/billing");
  revalidatePath(`/admin/billing/cycles/${cycleId}`);
  return { success: true };
}

export async function bulkUpdatePaymentStatus(
  cycleId: string, 
  invoiceIds: string[], 
  status: "unpaid" | "paid_cash" | "paid_zelle" | "card_processed" | "card_declined"
) {
  const supabase = createAdminClient();

  // Get invoices with member info for declined notifications
  const { data: invoicesData } = await supabase
    .from("invoices")
    .select(`
      id,
      member_id,
      total_amount,
      member:members(id, email, first_name, last_name, card_status)
    `)
    .in("id", invoiceIds);

  // Update invoice statuses
  const invoiceStatus = status === "card_declined" ? "pending" : 
                        status === "card_processed" ? "paid" : 
                        status === "paid_cash" ? "paid_cash" : 
                        status === "paid_zelle" ? "paid_cash" : "pending";
  
  const { error } = await supabase
    .from("invoices")
    .update({ 
      status: invoiceStatus, 
      payment_status: status 
    })
    .in("id", invoiceIds);

  if (error) {
    return { success: false, error: error.message };
  }

  // If marking as card declined, update member card_status and send notifications
  if (status === "card_declined" && invoicesData) {
    const memberIds = [...new Set(invoicesData.map(i => i.member_id))];
    
    // Update member card status to declined
    await supabase
      .from("members")
      .update({ card_status: "declined" })
      .in("id", memberIds);

    // Send decline notification emails
    for (const invoice of invoicesData) {
      const member = invoice.member as { email?: string; first_name?: string; last_name?: string } | null;
      if (member?.email) {
        try {
          await sendCustomEmail(
            member.email,
            "Payment Card Declined - Action Required",
            generateCardDeclinedEmailHtml({
              memberName: `${member.first_name} ${member.last_name}`,
            }),
            { recipientType: "member" }
          );
        } catch (e) {
          console.error("Failed to send decline email:", e);
        }
      }
    }
  }

  // If resetting to unpaid, delete any cash/zelle payment records
  if (status === "unpaid" && invoicesData) {
    await supabase
      .from("cash_payments")
      .delete()
      .in("invoice_id", invoiceIds);
  }

  // If marking as card processed, paid cash, or paid zelle, reset member card status to active
  if ((status === "card_processed" || status === "paid_cash" || status === "paid_zelle") && invoicesData) {
    const memberIds = [...new Set(invoicesData.map(i => i.member_id))];
    await supabase
      .from("members")
      .update({ card_status: "active" })
      .in("id", memberIds);
    
    // If Zelle payment, also record to cash_payments table
    if (status === "paid_zelle" && invoicesData) {
      for (const invoice of invoicesData) {
        await supabase.from("cash_payments").insert({
          invoice_id: invoice.id,
          member_id: invoice.member_id,
          billing_cycle_id: cycleId,
          amount: invoice.total_amount,
          payment_type: "zelle",
          notes: "Marked as Zelle paid from admin",
        });
      }
    }
  }

  revalidatePath("/admin/billing");
  revalidatePath(`/admin/billing/cycles/${cycleId}`);
  return { success: true };
}

export async function unmarkInvoicePayment(invoiceId: string) {
  const supabase = createAdminClient();

  // Get invoice info to find associated payments
  const { data: invoice } = await supabase
    .from("invoices")
    .select("member_id, billing_cycle_id")
    .eq("id", invoiceId)
    .single();

  // Delete any cash/zelle payments for this invoice
  if (invoice) {
    await supabase
      .from("cash_payments")
      .delete()
      .eq("invoice_id", invoiceId);
  }

  const { error } = await supabase
    .from("invoices")
    .update({ 
      status: "pending", 
      payment_status: "unpaid" 
    })
    .eq("id", invoiceId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin/billing");
  return { success: true };
}

function generateCardDeclinedEmailHtml(data: { memberName: string }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Payment Card Declined</h1>
          </div>
          
          <div style="padding: 32px;">
            <p style="font-size: 16px; color: #374151; margin: 0 0 16px 0;">
              Hello ${data.memberName},
            </p>
            
            <p style="color: #6b7280; margin: 0 0 24px 0;">
              We were unable to process your payment. Your card was declined.
            </p>
            
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="margin: 0; color: #991b1b; font-weight: 600;">Action Required</p>
              <p style="margin: 8px 0 0 0; color: #b91c1c; font-size: 14px;">
                Please log in to your account to update your payment card or request that we try charging your card again.
                If you do not resolve this issue, your account may be restricted.
              </p>
            </div>
            
            <p style="color: #6b7280; margin: 0;">
              If you have any questions, please contact us.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function getUnpaidInvoicesWithCards(cycleId: string) {
  const supabase = createAdminClient();
  
  // Get all invoices that are NOT fully paid
  // Include: pending, unpaid, partial_cash, and card_declined statuses
  const { data: invoices } = await supabase
    .from("invoices")
    .select(`
      id,
      member_id,
      total_amount,
      status,
      payment_status,
      member:members(
        id,
        first_name,
        last_name,
        email,
        phone,
        card_number,
        card_cvc,
        card_exp_month,
        card_exp_year,
        card_zip
      )
    `)
    .eq("billing_cycle_id", cycleId)
    .or("payment_status.eq.unpaid,payment_status.eq.partial_cash,payment_status.eq.card_declined,payment_status.is.null");
  
  // Get all cash/zelle payments for this cycle
  const { data: payments } = await supabase
    .from("cash_payments")
    .select("member_id, amount")
    .eq("billing_cycle_id", cycleId);

  // Group payments by member
  const paymentsByMember = new Map<string, number>();
  for (const payment of payments || []) {
    if (payment.member_id) {
      const existing = paymentsByMember.get(payment.member_id) || 0;
      paymentsByMember.set(payment.member_id, existing + Number(payment.amount));
    }
  }
  
  // Decrypt card data, subtract payments, and add fee calculation
  const FEE_PERCENTAGE = 0.10; // 10% fee for card payments
  
  const decryptedInvoices = (invoices || [])
    .map((inv) => {
      const totalAmount = Number(inv.total_amount);
      const amountPaid = paymentsByMember.get(inv.member_id) || 0;
      const amountOwed = Math.max(0, totalAmount - amountPaid);
      const feeAmount = amountOwed * FEE_PERCENTAGE;
      const totalWithFee = amountOwed + feeAmount;
      
      return {
        ...inv,
        total_amount: amountOwed,
        original_amount: totalAmount,
        amount_paid: amountPaid,
        fee_amount: feeAmount,
        total_with_fee: totalWithFee,
        member: inv.member ? {
          ...inv.member,
          card_number: inv.member.card_number && isEncrypted(inv.member.card_number)
            ? decryptCardData(inv.member.card_number)
            : inv.member.card_number,
          card_cvc: inv.member.card_cvc && isEncrypted(inv.member.card_cvc)
            ? decryptCardData(inv.member.card_cvc)
            : inv.member.card_cvc,
        } : null,
      };
    })
    .filter(inv => inv.total_amount > 0); // Only include invoices with remaining balance
  
  return decryptedInvoices;
}

export async function getFullCycleExportData(cycleId: string) {
  const supabase = createAdminClient();

  // Get cycle info
  const { data: cycle } = await supabase
    .from("billing_cycles")
    .select("*")
    .eq("id", cycleId)
    .single();

  if (!cycle) return null;

  // Get all active businesses
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name");

  // Get all members
  const { data: members } = await supabase
    .from("members")
    .select("id, first_name, last_name, pin_code")
    .order("last_name")
    .order("first_name");

  // Get all transactions for this cycle
  const { data: transactions } = await supabase
    .from("transactions")
    .select("member_id, business_id, amount")
    .eq("billing_cycle_id", cycleId);

  // Build member totals with business breakdowns - NO CASH PAYMENTS INCLUDED
  const memberData = (members || []).map(member => {
    const memberTransactions = (transactions || []).filter(t => t.member_id === member.id);
    const transactionTotal = memberTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    
    // Calculate per-business totals
    const businessTotals: Record<string, number> = {};
    (businesses || []).forEach(biz => {
      const bizTotal = memberTransactions
        .filter(t => t.business_id === biz.id)
        .reduce((sum, t) => sum + Number(t.amount), 0);
      businessTotals[biz.id] = bizTotal;
    });

    return {
      lastName: member.last_name,
      firstName: member.first_name,
      pin: member.pin_code || "",
      total: transactionTotal,
      businessTotals,
    };
  });

  return {
    cycle,
    businesses: businesses || [],
    members: memberData,
  };
}

export async function getAllTransactionsForCycle(cycleId: string) {
  const supabase = createAdminClient();
  
  // Get all transactions for this cycle with member and business info
  const { data: transactions } = await supabase
    .from("transactions")
    .select(`
      id,
      amount,
      description,
      created_at,
      balance_before,
      balance_after,
      source,
      notes,
      member:members(
        id,
        first_name,
        last_name,
        member_code,
        email,
        phone
      ),
      business:businesses(
        id,
        name
      )
    `)
    .eq("billing_cycle_id", cycleId)
    .order("created_at", { ascending: false });
  
  return transactions || [];
}

function generateInvoiceEmailHtml(data: {
  memberName: string;
  cycleName: string;
  startDate: string;
  endDate: string;
  totalAmount: number;
  customMessage: string | null;
  transactions: Array<{ amount: number; created_at: string; business?: { name: string } }>;
}) {
  // Format date without timezone conversion (prevents day shift issues)
  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('T')[0].split('-');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthIndex = parseInt(month, 10) - 1;
    return `${monthNames[monthIndex]} ${parseInt(day, 10)}, ${year}`;
  };

  // Group transactions by business
  const businessTotals: Record<string, { name: string; total: number; count: number }> = {};
  for (const tx of data.transactions) {
    const businessName = tx.business?.name || "Other";
    if (!businessTotals[businessName]) {
      businessTotals[businessName] = { name: businessName, total: 0, count: 0 };
    }
    businessTotals[businessName].total += Number(tx.amount);
    businessTotals[businessName].count += 1;
  }

  const businessSummary = Object.values(businessTotals).sort((a, b) => b.total - a.total);

  const businessRows = businessSummary
    .map(
      (biz) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${biz.name}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${biz.count}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">₪${biz.total.toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  const transactionRows = data.transactions
    .map(
      (tx) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${formatDate(tx.created_at)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: left;">${tx.business?.name || "Other"}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">₪${Number(tx.amount).toFixed(2)}</td>
      </tr>
    `
    )
    .join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f9fafb;">
      <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Invoice Statement</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0;">${data.cycleName}</p>
          </div>
          
          <div style="padding: 32px;">
            <p style="font-size: 16px; color: #374151; margin: 0 0 16px 0;">
              Hello ${data.memberName},
            </p>
            
            ${
              data.customMessage
                ? `<div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                <p style="margin: 0; color: #4b5563;">${data.customMessage}</p>
              </div>`
                : ""
            }
            
            <p style="color: #6b7280; margin: 0 0 24px 0;">
              Here is your statement for the period <strong>${formatDate(data.startDate)}</strong> to <strong>${formatDate(data.endDate)}</strong>.
            </p>
            
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="margin: 0; color: #166534; font-size: 14px;">Total Amount Due</p>
              <p style="margin: 8px 0 0 0; color: #15803d; font-size: 32px; font-weight: bold;">₪${Number(data.totalAmount).toFixed(2)}</p>
            </div>
            
            <h3 style="color: #374151; margin: 0 0 16px 0;">Spending Summary</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background: #f9fafb;">
                  <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Business</th>
                  <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">Transactions</th>
                  <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${businessRows}
              </tbody>
              <tfoot>
                <tr style="background: #f9fafb;">
                  <td style="padding: 12px; font-weight: bold;">Total</td>
                  <td style="padding: 12px; text-align: center;">${data.transactions.length} transactions</td>
                  <td style="padding: 12px; text-align: right; font-weight: bold;">₪${Number(data.totalAmount).toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          <div style="background: #f9fafb; padding: 24px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
              If you have any questions, please contact us.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
