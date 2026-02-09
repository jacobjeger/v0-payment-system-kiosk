"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { sendCustomEmail } from "@/lib/email";

const ERROR_NOTIFICATION_EMAIL = "akivajeger@gmail.com";

export async function logError(errorData: {
  message: string;
  stack_trace?: string;
  component?: string;
  url?: string;
  user_agent?: string;
  context?: Record<string, unknown>;
}) {
  try {
    const supabase = createAdminClient();
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Insert error into database
    const { data, error: dbError } = await supabase
      .from("error_logs")
      .insert({
        error_id: errorId,
        message: errorData.message,
        stack_trace: errorData.stack_trace,
        component: errorData.component,
        url: errorData.url,
        user_agent: errorData.user_agent,
        context: errorData.context,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Failed to log error to database:", dbError);
      return { success: false, error: dbError.message };
    }

    // Send email notification with error details
    try {
      const errorHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
          <div style="background-color: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">🚨 Application Error Alert</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">Error ID: ${errorId}</p>
          </div>
          
          <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
            <h2 style="margin-top: 0; color: #1f2937; font-size: 18px;">Error Details</h2>
            
            <div style="margin: 20px 0; padding: 15px; background-color: white; border-left: 4px solid #dc2626; border-radius: 4px;">
              <p style="margin: 0 0 10px 0;"><strong>Message:</strong></p>
              <p style="margin: 0; font-family: monospace; color: #7f1d1d; word-break: break-word;">${errorData.message}</p>
            </div>

            ${errorData.component ? `
              <div style="margin: 15px 0;">
                <strong>Component:</strong> <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">${errorData.component}</code>
              </div>
            ` : ""}

            ${errorData.url ? `
              <div style="margin: 15px 0;">
                <strong>Page URL:</strong> <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; word-break: break-all;">${errorData.url}</code>
              </div>
            ` : ""}

            ${errorData.stack_trace ? `
              <div style="margin: 15px 0;">
                <strong>Stack Trace:</strong>
                <pre style="background-color: #1f2937; color: #d1d5db; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; margin: 10px 0 0 0;">${escapeHtml(errorData.stack_trace)}</pre>
              </div>
            ` : ""}

            ${errorData.context && Object.keys(errorData.context).length > 0 ? `
              <div style="margin: 15px 0;">
                <strong>Additional Context:</strong>
                <pre style="background-color: #f3f4f6; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 12px; margin: 10px 0 0 0;">${escapeHtml(JSON.stringify(errorData.context, null, 2))}</pre>
              </div>
            ` : ""}

            <div style="margin: 20px 0; padding: 12px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
              <p style="margin: 0; font-size: 13px; color: #92400e;">
                <strong>Time:</strong> ${new Date().toISOString()}
              </p>
            </div>
          </div>

          <div style="background-color: #f3f4f6; padding: 15px; border-radius: 0 0 8px 8px; font-size: 12px; color: #6b7280;">
            <p style="margin: 0;">This is an automated error notification from PDCA Payment System.</p>
          </div>
        </div>
      `;

      await sendCustomEmail(
        ERROR_NOTIFICATION_EMAIL,
        `🚨 Error Alert: ${errorData.message.substring(0, 50)}...`,
        errorHtml,
        { recipientType: "admin" }
      );

      // Mark as notified
      await supabase
        .from("error_logs")
        .update({ notified_at: new Date().toISOString() })
        .eq("error_id", errorId);
    } catch (emailError) {
      console.error("Failed to send error notification email:", emailError);
      // Don't fail the entire operation if email fails
    }

    return { success: true, errorId };
  } catch (error) {
    console.error("Error in logError:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

export async function getRecentErrors(limit: number = 10) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("error_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Failed to fetch error logs:", error);
    return [];
  }

  return data || [];
}
