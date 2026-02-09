"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { notifyAdminsNewDispute, notifyDisputeStatus } from "@/lib/email";

export async function getBusinessDisputes(businessId: string, cycleId?: string | null) {
  const supabase = createAdminClient();
  
  // If a cycle is specified, we need to filter disputes by transactions in that cycle
  let query = supabase
    .from("transaction_reviews")
    .select(`
      id,
      reason,
      status,
      admin_notes,
      created_at,
      resolved_at,
      submitted_by,
      member_id,
      transaction_id,
      transactions (
        id,
        amount,
        description,
        created_at,
        billing_cycle_id,
        members ( first_name, last_name )
      )
    `)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    return { success: false, error: error.message, data: [] };
  }

  // Filter by cycle on the client side since we need to check the nested transactions.billing_cycle_id
  let filteredData = data || [];
  if (cycleId) {
    filteredData = filteredData.filter(dispute => {
      const transaction = dispute.transactions as { billing_cycle_id: string | null } | null;
      return transaction && transaction.billing_cycle_id === cycleId;
    });
  }

  return { success: true, data: filteredData };
}

export async function submitTransactionDispute(data: {
  transactionId: string;
  businessId?: string;
  memberId?: string;
  reason: string;
}) {
  const supabase = createAdminClient();

  // Determine who is submitting the dispute
  const submittedBy = data.memberId ? "member" : "business";

  // Create the review request
  const { error } = await supabase
    .from("transaction_reviews")
    .insert({
      transaction_id: data.transactionId,
      business_id: data.businessId || null,
      member_id: data.memberId || null,
      reason: data.reason.trim(),
      status: "pending",
      submitted_by: submittedBy,
    });

  if (error) {
    return { success: false, error: error.message };
  }

  // Get transaction details for email
  const { data: transaction } = await supabase
    .from("transactions")
    .select(`
      amount,
      members(first_name, last_name),
      businesses(name)
    `)
    .eq("id", data.transactionId)
    .single();

  // Notify admins via email
  if (transaction) {
    const member = transaction.members as { first_name: string; last_name: string } | null;
    const business = transaction.businesses as { name: string } | null;
    
    const disputeSource = submittedBy === "member" 
      ? `Member: ${member ? `${member.first_name} ${member.last_name}` : "Unknown"}`
      : `Business: ${business?.name || "Unknown"}`;
    
    await notifyAdminsNewDispute(
      disputeSource,
      submittedBy === "member" 
        ? (business?.name || "Unknown Business")
        : (member ? `${member.first_name} ${member.last_name}` : "Unknown Member"),
      Number(transaction.amount).toFixed(2),
      data.reason
    );
  }

  revalidatePath("/business/transactions");
  revalidatePath("/member/dashboard");
  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  return { success: true };
}

export async function resolveDispute(data: {
  reviewId: string;
  status: "resolved" | "rejected";
  adminNotes?: string;
  newAmount?: number;
}) {
  const supabase = createAdminClient();

  // Get the review with full details
  const { data: review } = await supabase
    .from("transaction_reviews")
    .select(`
      *,
      transactions(
        id,
        amount,
        member_id,
        members(id, first_name, last_name, email),
        businesses(id, name, email)
      )
    `)
    .eq("id", data.reviewId)
    .single();

  if (!review) {
    return { success: false, error: "Review not found" };
  }

  const transaction = review.transactions as {
    id: string;
    amount: number;
    member_id: string;
    members: { id: string; first_name: string; last_name: string; email: string | null } | null;
    businesses: { id: string; name: string; email: string | null } | null;
  } | null;

  // If resolved (approved), void the transaction to remove it and update member balance
  if (data.status === "resolved" && transaction) {
    // Use void_transaction RPC to properly handle balance adjustment
    const { error: voidError } = await supabase.rpc(
      "void_transaction",
      {
        p_transaction_id: transaction.id,
        p_reason: `Dispute approved: ${data.adminNotes || "Transaction disputed"}`,
        p_admin_user_id: null,
      }
    );

    if (voidError) {
      console.error("Failed to void transaction during dispute resolution:", voidError);
      return { success: false, error: "Failed to void transaction: " + voidError.message };
    }
  }

  // If updating amount and rejecting dispute, update the transaction amount
  if (data.newAmount !== undefined && data.status === "rejected") {
    // Calculate the difference to adjust member balance
    if (transaction && transaction.member_id) {
      const oldAmount = Number(transaction.amount);
      const difference = data.newAmount - oldAmount;

      // Update transaction amount
      await supabase
        .from("transactions")
        .update({ amount: data.newAmount })
        .eq("id", transaction.id);

      // Adjust member balance
      const { data: member } = await supabase
        .from("members")
        .select("balance")
        .eq("id", transaction.member_id)
        .single();

      if (member) {
        await supabase
          .from("members")
          .update({ balance: Number(member.balance) + difference })
          .eq("id", transaction.member_id);
      }
    }
  }

  // Update the review status
  await supabase
    .from("transaction_reviews")
    .update({
      status: data.status,
      admin_notes: data.adminNotes || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", data.reviewId);

  // Send email notification to the submitter
  if (transaction) {
    const amount = data.newAmount !== undefined && data.status === "rejected" ? data.newAmount : transaction.amount;
    
    // Determine who submitted the dispute and notify them
    if (review.submitted_by === "member" && transaction.members?.email) {
      await notifyDisputeStatus(
        transaction.members.email,
        `${transaction.members.first_name} ${transaction.members.last_name}`,
        "member",
        data.status,
        Number(amount).toFixed(2),
        data.adminNotes
      );
    } else if (review.submitted_by === "business" && transaction.businesses?.email) {
      await notifyDisputeStatus(
        transaction.businesses.email,
        transaction.businesses.name,
        "business",
        data.status,
        Number(amount).toFixed(2),
        data.adminNotes
      );
    } else if (review.business_id && transaction.businesses?.email) {
      // Fallback for older disputes without submitted_by field
      await notifyDisputeStatus(
        transaction.businesses.email,
        transaction.businesses.name,
        "business",
        data.status,
        Number(amount).toFixed(2),
        data.adminNotes
      );
    }
  }

  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  return { success: true };
}
