"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function resendFailedEmails(emailIds?: string[]) {
  const supabase = createAdminClient();

  // Get failed/bounced emails to resend
  let query = supabase
    .from("email_logs")
    .select("*")
    .in("status", ["failed", "bounced"]);

  if (emailIds && emailIds.length > 0) {
    query = query.in("id", emailIds);
  }

  const { data: failedEmails, error } = await query;

  if (error || !failedEmails) {
    return { success: false, error: error?.message || "Failed to fetch emails" };
  }

  if (failedEmails.length === 0) {
    return { success: true, resent: 0, failed: 0, message: "No failed emails to resend" };
  }

  const results = {
    resent: 0,
    failed: 0,
    details: [] as Array<{ email: string; success: boolean; error?: string }>,
  };

  for (const email of failedEmails) {
    try {
      // Resend the email
      const { data, error: resendError } = await resend.emails.send({
        from: `PDCA <${email.from_email}>`,
        to: email.to_email,
        subject: email.subject,
        html: email.body_html || "",
      });

      if (resendError) {
        // Update email log with new failure
        await supabase
          .from("email_logs")
          .update({
            error_message: resendError.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", email.id);

        results.failed++;
        results.details.push({
          email: email.to_email,
          success: false,
          error: resendError.message,
        });
      } else {
        // Update email log with success
        await supabase
          .from("email_logs")
          .update({
            resend_id: data?.id || null,
            status: "sent",
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", email.id);

        results.resent++;
        results.details.push({
          email: email.to_email,
          success: true,
        });
      }

      // Add 600ms delay to respect rate limit (2 req/sec)
      await new Promise((resolve) => setTimeout(resolve, 600));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results.failed++;
      results.details.push({
        email: email.to_email,
        success: false,
        error: errorMessage,
      });

      // Update email log with error
      await supabase
        .from("email_logs")
        .update({
          error_message: errorMessage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", email.id);
    }
  }

  return {
    success: true,
    resent: results.resent,
    failed: results.failed,
    details: results.details,
  };
}
