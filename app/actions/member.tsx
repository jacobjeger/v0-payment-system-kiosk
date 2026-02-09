"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server";
import { sendCustomEmail } from "@/lib/email";
import { encryptCardData, decryptCardData, isEncrypted } from "@/lib/encryption";
import { notifyAdminsNewCardRequest } from "@/lib/email";

export async function submitNewCard(data: {
  memberId: string;
  cardNumber: string;
  cardCvc: string;
  cardExpMonth: string;
  cardExpYear: string;
  cardZip?: string;
}) {
  const supabase = createAdminClient();
  
  // Encrypt sensitive card data before storing
  const encryptedCardNumber = encryptCardData(data.cardNumber);
  const encryptedCvc = encryptCardData(data.cardCvc);
  
  // Create a pending card change request with encrypted data
  const { error } = await supabase.from("pending_card_changes").insert({
    member_id: data.memberId,
    request_type: "update_card",
    new_card_number: encryptedCardNumber,
    new_card_cvc: encryptedCvc,
    new_card_exp_month: data.cardExpMonth,
    new_card_exp_year: data.cardExpYear,
    new_card_zip: data.cardZip || null,
    status: "pending",
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Get current member to check card status
  const { data: member } = await supabase
    .from("members")
    .select("card_status")
    .eq("id", data.memberId)
    .single();

  // Update member status to pending_review if they were declined
  if (member?.card_status === "declined") {
    await supabase
      .from("members")
      .update({ card_status: "pending_review" })
      .eq("id", data.memberId);
  }

  // Get member details for email notification
  const { data: memberDetails } = await supabase
    .from("members")
    .select("first_name, last_name, email")
    .eq("id", data.memberId)
    .single();

  // Notify admins via email
  if (memberDetails) {
    await notifyAdminsNewCardRequest(
      `${memberDetails.first_name} ${memberDetails.last_name}`,
      memberDetails.email || "No email",
      "update_card"
    );
  }

  revalidatePath("/member/profile");
  return { success: true };
}

export async function requestRetryCharge(memberId: string) {
  const supabase = createAdminClient();
  
  // Create a retry charge request
  const { error } = await supabase.from("pending_card_changes").insert({
    member_id: memberId,
    request_type: "retry_charge",
    status: "pending",
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Get current member to check card status
  const { data: member } = await supabase
    .from("members")
    .select("card_status")
    .eq("id", memberId)
    .single();

  // Update member status to pending_review
  if (member?.card_status === "declined") {
    await supabase
      .from("members")
      .update({ card_status: "pending_review" })
      .eq("id", memberId);
  }

  // Get member details for email notification
  const { data: memberDetails } = await supabase
    .from("members")
    .select("first_name, last_name, email")
    .eq("id", memberId)
    .single();

  // Notify admins via email
  if (memberDetails) {
    await notifyAdminsNewCardRequest(
      `${memberDetails.first_name} ${memberDetails.last_name}`,
      memberDetails.email || "No email",
      "retry_charge"
    );
  }

  revalidatePath("/member/profile");
  return { success: true };
}

export async function updateMemberPin(memberId: string, newPin: string) {
  const supabase = createAdminClient();
  
  // Validate PIN format (4 digits)
  if (!/^\d{4}$/.test(newPin)) {
    return { success: false, error: "PIN must be exactly 4 digits" };
  }
  
  const { error } = await supabase
    .from("members")
    .update({ pin_code: newPin })
    .eq("id", memberId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/member/dashboard");
  revalidatePath("/member/profile");
  return { success: true };
}

export async function getMemberDisputes(memberId: string) {
  const supabase = createAdminClient();
  
  const { data, error } = await supabase
    .from("transaction_reviews")
    .select(`
      id,
      reason,
      status,
      admin_notes,
      created_at,
      resolved_at,
      transactions (
        id,
        amount,
        description,
        created_at,
        businesses ( name )
      )
    `)
    .eq("member_id", memberId)
    .order("created_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message, data: [] };
  }

  return { success: true, data: data || [] };
}

export async function submitTransactionDispute(data: {
  transactionId: string;
  memberId: string;
  reason: string;
}) {
  const supabase = createAdminClient();
  
  // First get the transaction to find the business_id
  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select("business_id")
    .eq("id", data.transactionId)
    .single();

  if (txError || !transaction) {
    return { success: false, error: "Transaction not found" };
  }

  // Insert into transaction_reviews (the table admin reviews page uses)
  const { error } = await supabase.from("transaction_reviews").insert({
    transaction_id: data.transactionId,
    member_id: data.memberId,
    business_id: transaction.business_id,
    reason: data.reason,
    status: "pending",
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/member/dashboard");
  revalidatePath("/admin/reviews");
  return { success: true };
}

export async function getMemberCardLast4(memberId: string): Promise<string> {
  const supabase = createAdminClient();
  
  const { data: member } = await supabase
    .from("members")
    .select("card_number")
    .eq("id", memberId)
    .single();
  
  if (!member?.card_number) return "";
  
  // Decrypt if encrypted, then return last 4 digits
  const cardNumber = isEncrypted(member.card_number) 
    ? decryptCardData(member.card_number) 
    : member.card_number;
  
  return cardNumber.slice(-4);
}

export async function markCardAsDeclined(memberId: string) {
  const supabase = createAdminClient();
  
  // Calculate deadline: 3 days from now
  const now = new Date();
  const deadline = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  
  // Update member's card status
  const { error } = await supabase
    .from("members")
    .update({ 
      card_status: "declined",
    })
    .eq("id", memberId);

  if (error) {
    return { 
      success: false, 
      error: error.message,
      deadline: null,
    };
  }

  revalidatePath("/member/profile");
  revalidatePath("/member/dashboard");
  
  return { 
    success: true,
    deadline: deadline.toISOString(),
  };
}

export async function sendCardDeclineNotification(data: {
  memberId: string;
  billingCycle: string;
  adminName: string;
  adminPhone: string;
}) {
  const supabase = createAdminClient();
  
  // Get member details
  const { data: member } = await supabase
    .from("members")
    .select("first_name, last_name, email, phone")
    .eq("id", data.memberId)
    .single();

  if (!member) {
    return { success: false, error: "Member not found" };
  }

  // Calculate deadline: 72 hours from now
  const now = new Date();
  const deadline = new Date(now.getTime() + 72 * 60 * 60 * 1000);

  // Format deadline with full day, date and time
  const deadlineText = deadline.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const message = `Hi ${member.first_name},

Your card declined for ${data.billingCycle} collection. Please contact ${data.adminName} or ${data.adminPhone} to resolve this. Your account will be restricted if it's not resolved by ${deadlineText}.

You can update your card information on our website: https://tcpdca.com`;

  // Send email to member
  if (member.email) {
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #d32f2f;">Card Payment Declined</h2>
        <p>Hi ${member.first_name},</p>
        <p>Your card was declined for <strong>${data.billingCycle}</strong> collection.</p>
        <p>Please contact <strong>${data.adminName}</strong> or <strong>${data.adminPhone}</strong> to resolve this issue.</p>
        <p>You can also use the kiosk to retry charging your existing card or update your payment information.</p>
        <p style="margin-top: 20px; font-size: 12px; color: #666;">
          If you have any questions, please contact ${data.adminPhone}.
        </p>
      </div>
    `;

    try {
      await sendCustomEmail(
        member.email,
        "Your Card Payment Was Declined - Action Required",
        emailHtml,
        {
          recipientType: "member",
          recipientId: data.memberId,
        }
      );
    } catch (emailError) {
      console.error("[v0] Failed to send email:", emailError);
      // Continue even if email fails - the notification was still created
    }
  }

  // Store notification in database
  const { error: notificationError } = await supabase
    .from("member_notifications")
    .insert({
      member_id: data.memberId,
      type: "card_declined",
      message: message,
      created_at: new Date().toISOString(),
    });

  if (notificationError) {
    console.error("[v0] Failed to store notification:", notificationError);
    // Continue even if storage fails - the message was still shown to admin
  }

  return { 
    success: true, 
    message: message,
    deadline: deadline.toISOString(),
  };
}

export async function markCardAsResolved(memberId: string) {
  const supabase = createAdminClient();

  // Get member details for email
  const { data: member } = await supabase
    .from("members")
    .select("first_name, email, card_status")
    .eq("id", memberId)
    .single();

  if (!member) {
    return { success: false, error: "Member not found" };
  }

  if (member.card_status !== "declined") {
    return { success: false, error: "Card is not marked as declined" };
  }

  // Update member's card status back to active
  const { error } = await supabase
    .from("members")
    .update({ 
      card_status: "active",
    })
    .eq("id", memberId);

  if (error) {
    return { 
      success: false, 
      error: error.message,
    };
  }

  // Send confirmation email to member
  if (member.email) {
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #28a745;">Card Payment Issue Resolved</h2>
        <p>Hi ${member.first_name},</p>
        <p>Good news! Your card payment issue has been resolved. Your account is now active and ready to use.</p>
        <p>You can continue making purchases normally. Thank you for resolving this promptly.</p>
        <p style="margin-top: 20px; font-size: 12px; color: #666;">
          If you have any questions, please contact us at Call/text Tzachi at 845-573-1405.
        </p>
      </div>
    `;

    try {
      await sendCustomEmail(
        member.email,
        "Your Card Payment Issue Has Been Resolved",
        emailHtml,
        {
          recipientType: "member",
          recipientId: memberId,
        }
      );
    } catch (emailError) {
      console.error("[v0] Failed to send resolution email:", emailError);
      // Continue even if email fails
    }
  }

  revalidatePath("/member/profile");
  revalidatePath("/member/dashboard");
  
  return { 
    success: true,
  };
}
