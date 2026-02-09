import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/server";

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailVariables {
  [key: string]: string;
}

interface SendOptions {
  recipientType?: "member" | "business" | "admin" | "other";
  recipientId?: string;
  templateKey?: string;
}

export async function getEmailTemplate(templateKey: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("email_templates")
    .select("*")
    .eq("template_key", templateKey)
    .eq("is_active", true)
    .single();
  
  return data;
}

export function replaceVariables(text: string, variables: EmailVariables): string {
  let result = text;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

// Core email sending function with logging
async function sendEmailWithLogging(
  to: string,
  subject: string,
  html: string,
  options: SendOptions = {}
) {
  const supabase = createAdminClient();
  const fromEmail = "noreply@tcpdca.com";

  try {
    const { data, error } = await resend.emails.send({
      from: `PDCA <${fromEmail}>`,
      to,
      subject,
      html,
    });

    // Log the email
    await supabase.from("email_logs").insert({
      resend_id: data?.id || null,
      template_key: options.templateKey || null,
      from_email: fromEmail,
      to_email: to,
      subject,
      body_html: html,
      status: error ? "failed" : "sent",
      recipient_type: options.recipientType || "other",
      recipient_id: options.recipientId || null,
      error_message: error?.message || null,
      metadata: {},
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    // Log failed attempt
    await supabase.from("email_logs").insert({
      from_email: fromEmail,
      to_email: to,
      subject,
      body_html: html,
      status: "failed",
      recipient_type: options.recipientType || "other",
      recipient_id: options.recipientId || null,
      error_message: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
}

export async function sendTemplateEmail(
  to: string,
  templateKey: string,
  variables: EmailVariables,
  options: Omit<SendOptions, "templateKey"> = {}
) {
  const template = await getEmailTemplate(templateKey);
  
  if (!template) {
    console.error(`Email template '${templateKey}' not found or inactive`);
    return { success: false, error: "Template not found" };
  }

  const subject = replaceVariables(template.subject, variables);
  const html = replaceVariables(template.body_html, variables);

  return sendEmailWithLogging(to, subject, html, {
    ...options,
    templateKey,
  });
}

// Send custom email (not using template)
export async function sendCustomEmail(
  to: string,
  subject: string,
  html: string,
  options: SendOptions = {}
) {
  return sendEmailWithLogging(to, subject, html, options);
}

// Convenience functions for specific email types
export async function sendBusinessWelcomeEmail(
  email: string,
  businessName: string,
  username: string,
  tempPassword: string,
  businessId?: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const loginLink = `${baseUrl}/business/login`;
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Welcome to PDCA, ${businessName}!</h1>
      <p style="color: #666; font-size: 16px; line-height: 1.5;">
        Your business account has been created. You can now log in to the business portal to view your transactions and manage your account.
      </p>
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0; color: #333; font-weight: 600;">Your Login Details:</p>
        <p style="margin: 5px 0; color: #666;"><strong>Username:</strong> ${username}</p>
        <p style="margin: 5px 0; color: #666;"><strong>Temporary Password:</strong> <code style="background: #e0e0e0; padding: 2px 6px; border-radius: 4px;">${tempPassword}</code></p>
      </div>
      <p style="color: #666; font-size: 14px; line-height: 1.5;">
        For security, please change your password after your first login.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${loginLink}" style="background-color: #22c55e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
          Log In to Business Portal
        </a>
      </div>
    </div>
  `;
  
  return sendCustomEmail(email, "Welcome to PDCA - Your Business Account", html, {
    recipientType: "business",
    recipientId: businessId,
  });
}

export async function sendMemberWelcomeEmail(
  email: string,
  memberName: string,
  resetLink: string,
  memberId?: string
) {
  return sendTemplateEmail(email, "member_welcome", {
    name: memberName,
    email,
    reset_link: resetLink,
  }, {
    recipientType: "member",
    recipientId: memberId,
  });
}

export async function sendTempPasswordEmail(
  email: string,
  name: string,
  tempPassword: string,
  loginLink: string,
  recipientType?: "member" | "business",
  recipientId?: string
) {
  return sendTemplateEmail(email, "temp_password", {
    name,
    email,
    temp_password: tempPassword,
    login_link: loginLink,
  }, {
    recipientType,
    recipientId,
  });
}

export async function sendMagicLinkEmail(
  email: string,
  loginLink: string
) {
  return sendTemplateEmail(email, "magic_link", {
    email,
    login_link: loginLink,
  });
}

export async function sendInvoiceEmail(
  email: string,
  name: string,
  billingPeriod: string,
  totalAmount: string,
  customMessage: string = "",
  memberId?: string
) {
  return sendTemplateEmail(email, "invoice", {
    name,
    email,
    billing_period: billingPeriod,
    total_amount: totalAmount,
    currency: "₪",
    custom_message: customMessage,
  }, {
    recipientType: "member",
    recipientId: memberId,
  });
}

// Send notification to all admins
export async function notifyAdmins(
  subject: string,
  html: string
) {
  const supabase = createAdminClient();
  
  // Get all admin emails
  const { data: admins } = await supabase
    .from("admins")
    .select("email")
    .eq("is_active", true);
  
  if (!admins || admins.length === 0) {
    return { success: false, error: "No active admins found" };
  }
  
  // Send email to each admin
  const results = await Promise.all(
    admins.map(admin => 
      sendCustomEmail(admin.email, subject, html, { recipientType: "admin" })
    )
  );
  
  const successCount = results.filter(r => r.success).length;
  return { success: successCount > 0, sent: successCount, total: admins.length };
}

// Notify admins about a new dispute
export async function notifyAdminsNewDispute(
  submittedBy: string,
  otherParty: string,
  amount: string,
  reason: string
) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">New Transaction Dispute</h2>
      <p>A dispute has been submitted for review:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; font-weight: bold;">Submitted By:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${submittedBy}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; font-weight: bold;">Regarding:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${otherParty}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; font-weight: bold;">Amount:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">₪${amount}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; font-weight: bold;">Reason:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${reason}</td>
        </tr>
      </table>
      <p>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin/reviews" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: white; text-decoration: none; border-radius: 6px;">
          Review Disputes
        </a>
      </p>
    </div>
  `;
  
  return notifyAdmins("New Transaction Dispute Submitted", html);
}

// Notify admins about a new card change request
export async function notifyAdminsNewCardRequest(
  memberName: string,
  memberEmail: string,
  requestType: "update_card" | "retry_charge"
) {
  const typeLabel = requestType === "update_card" ? "New Card Submitted" : "Retry Charge Requested";
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">${typeLabel}</h2>
      <p>A member has submitted a card change request:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; font-weight: bold;">Member:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${memberName}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; font-weight: bold;">Email:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${memberEmail}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5; font-weight: bold;">Request Type:</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e5e5;">${typeLabel}</td>
        </tr>
      </table>
      <p>
        <a href="${process.env.NEXT_PUBLIC_SITE_URL}/admin/billing/declined" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: white; text-decoration: none; border-radius: 6px;">
          Review Card Requests
        </a>
      </p>
    </div>
  `;
  
  return notifyAdmins(`Card Request: ${typeLabel}`, html);
}

// Notify member about card request status update
export async function notifyMemberCardStatus(
  memberEmail: string,
  memberName: string,
  status: "approved" | "rejected",
  adminNotes?: string
) {
  const isApproved = status === "approved";
  const statusText = isApproved ? "Approved" : "Declined";
  const statusColor = isApproved ? "#16a34a" : "#dc2626";
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${statusColor};">Card Update ${statusText}</h2>
      <p>Hello ${memberName},</p>
      <p>Your card update request has been <strong style="color: ${statusColor};">${statusText.toLowerCase()}</strong>.</p>
      ${isApproved 
        ? `<p>Your new card is now active and will be used for future billing.</p>`
        : `<p>Unfortunately, we were unable to process your card update at this time.</p>`
      }
      ${adminNotes ? `
        <div style="background-color: #f5f5f5; padding: 12px; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0; font-size: 14px;"><strong>Note from admin:</strong></p>
          <p style="margin: 8px 0 0 0; font-size: 14px;">${adminNotes}</p>
        </div>
      ` : ''}
      ${!isApproved ? `
        <p>Please submit a new card or contact support for assistance.</p>
        <p>
          <a href="${process.env.NEXT_PUBLIC_SITE_URL}/member/profile" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: white; text-decoration: none; border-radius: 6px;">
            Update Card Info
          </a>
        </p>
      ` : ''}
    </div>
  `;
  
  return sendCustomEmail(
    memberEmail,
    `Card Update ${statusText}`,
    html,
    { recipientType: "member" }
  );
}

// Notify member/business about dispute status update
export async function notifyDisputeStatus(
  recipientEmail: string,
  recipientName: string,
  recipientType: "member" | "business",
  status: "resolved" | "rejected",
  transactionAmount: string,
  adminNotes?: string
) {
  const isResolved = status === "resolved";
  const statusText = isResolved ? "Resolved" : "Rejected";
  const statusColor = isResolved ? "#16a34a" : "#dc2626";
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${statusColor};">Dispute ${statusText}</h2>
      <p>Hello ${recipientName},</p>
      <p>Your dispute for a transaction of <strong>₪${transactionAmount}</strong> has been <strong style="color: ${statusColor};">${statusText.toLowerCase()}</strong>.</p>
      ${adminNotes ? `
        <div style="background-color: #f5f5f5; padding: 12px; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0; font-size: 14px;"><strong>Resolution details:</strong></p>
          <p style="margin: 8px 0 0 0; font-size: 14px;">${adminNotes}</p>
        </div>
      ` : ''}
      <p>If you have any questions, please contact support.</p>
    </div>
  `;
  
  return sendCustomEmail(
    recipientEmail,
    `Transaction Dispute ${statusText}`,
    html,
    { recipientType }
  );
}

// Send password reset email
export async function sendPasswordResetEmail(
  email: string,
  resetLink: string,
  userType: "member" | "business" | "admin",
  firstName?: string
) {
  const portalName = userType === "member" ? "Member" : userType === "business" ? "Business" : "Admin";
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Password Reset Request</h1>
      <p style="color: #666; font-size: 16px; line-height: 1.5;">${greeting}</p>
      <p style="color: #666; font-size: 16px; line-height: 1.5;">
        We received a request to reset your password for the PDCA ${portalName} Portal.
      </p>
      <p style="color: #666; font-size: 16px; line-height: 1.5;">
        Click the button below to reset your password. This link will expire in 1 hour.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background-color: #22c55e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p style="color: #999; font-size: 14px; line-height: 1.5;">
        If you didn't request this password reset, you can safely ignore this email. Your password will not be changed.
      </p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
      <p style="color: #999; font-size: 12px;">
        If the button doesn't work, copy and paste this link into your browser:<br/>
        <a href="${resetLink}" style="color: #22c55e;">${resetLink}</a>
      </p>
    </div>
  `;
  
  return sendCustomEmail(
    email,
    "Reset Your Password - PDCA",
    html,
    { recipientType: userType === "admin" ? "other" : userType }
  );
}

// Send welcome email to admin with temporary password
export async function sendAdminWelcomeEmail(
  email: string,
  firstName: string,
  tempPassword: string
) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const loginLink = `${baseUrl}/auth/login`;
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Welcome to PDCA Admin, ${firstName}!</h1>
      <p style="color: #666; font-size: 16px; line-height: 1.5;">
        Your admin account has been created. You can now log in to manage members, businesses, and billing.
      </p>
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0; color: #333; font-weight: 600;">Your Login Details:</p>
        <p style="margin: 5px 0; color: #666;"><strong>Email:</strong> ${email}</p>
        <p style="margin: 5px 0; color: #666;"><strong>Temporary Password:</strong> <code style="background: #e0e0e0; padding: 2px 6px; border-radius: 4px;">${tempPassword}</code></p>
      </div>
      <p style="color: #666; font-size: 14px; line-height: 1.5;">
        For security, please change your password after your first login.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${loginLink}" style="background-color: #22c55e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
          Log In to Admin Portal
        </a>
      </div>
    </div>
  `;
  
  return sendCustomEmail(
    email,
    "Welcome to PDCA Admin - Your Account Details",
    html,
    { recipientType: "other" }
  );
}

// Alias for sendMemberWelcomeEmail for compatibility
export async function sendWelcomeEmail(
  options: {
    email: string;
    firstName: string;
    lastName?: string;
    tempPassword?: string;
    loginUrl?: string;
  }
) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const loginLink = options.loginUrl || `${baseUrl}/member/login`;
  
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Welcome to PDCA, ${options.firstName}!</h1>
      <p style="color: #666; font-size: 16px; line-height: 1.5;">
        Your account has been created. You can now log in to access your account.
      </p>
      ${options.tempPassword ? `
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; color: #333; font-weight: 600;">Your Login Details:</p>
          <p style="margin: 5px 0; color: #666;"><strong>Email:</strong> ${options.email}</p>
          <p style="margin: 5px 0; color: #666;"><strong>Temporary Password:</strong> <code style="background: #e0e0e0; padding: 2px 6px; border-radius: 4px;">${options.tempPassword}</code></p>
        </div>
        <p style="color: #666; font-size: 14px; line-height: 1.5;">
          For security, please change your password after your first login.
        </p>
      ` : ''}
      <div style="text-align: center; margin: 30px 0;">
        <a href="${loginLink}" style="background-color: #22c55e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
          Log In
        </a>
      </div>
    </div>
  `;
  
  return sendCustomEmail(
    options.email,
    "Welcome to PDCA - Your Account Details",
    html,
    { recipientType: "member" }
  );
}

// Alias for sendCustomEmail for compatibility
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options?: SendOptions
) {
  return sendCustomEmail(to, subject, html, options);
}
