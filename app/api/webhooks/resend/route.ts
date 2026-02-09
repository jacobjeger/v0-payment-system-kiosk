import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service role for webhook updates
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Resend webhook payload structure
    const { type, data, created_at } = body;
    
    // Get the email ID from the payload
    const emailId = data?.email_id;
    
    if (!emailId) {
      return NextResponse.json({ error: "No email ID" }, { status: 400 });
    }

    // Map Resend event types to our status and timestamps
    let status: string | null = null;
    const updates: Record<string, unknown> = {};
    
    switch (type) {
      case "email.delivered":
        status = "delivered";
        updates.delivered_at = created_at || new Date().toISOString();
        break;
      case "email.opened":
        status = "opened";
        updates.opened_at = created_at || new Date().toISOString();
        break;
      case "email.clicked":
        status = "clicked";
        break;
      case "email.bounced":
      case "email.complained":
        status = "bounced";
        break;
      default:
        // Ignore other events like email.sent
        return NextResponse.json({ received: true });
    }

    if (status) {
      updates.status = status;
      
      // Update email_logs table
      await supabase
        .from("email_logs")
        .update(updates)
        .eq("resend_id", emailId);

      // If this was an invoice email, also update the invoice status
      const { data: emailLog } = await supabase
        .from("email_logs")
        .select("template_key, recipient_id, to_email")
        .eq("resend_id", emailId)
        .single();

      if (emailLog?.template_key === "invoice" || emailLog?.to_email) {
        // Find matching invoice by member email
        const { data: invoice } = await supabase
          .from("invoices")
          .select("id, status")
          .eq("email_sent_to", emailLog.to_email)
          .order("sent_at", { ascending: false })
          .limit(1)
          .single();

        if (invoice) {
          // Status priority - only upgrade, never downgrade
          const statusPriority: Record<string, number> = {
            pending: 0,
            sent: 1,
            delivered: 2,
            opened: 3,
            paid: 4,
          };

          const currentPriority = statusPriority[invoice.status] || 0;
          const newPriority = statusPriority[status] || 0;

          if (newPriority > currentPriority) {
            await supabase
              .from("invoices")
              .update({ status })
              .eq("id", invoice.id);
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

// Resend might use GET for webhook verification
export async function GET() {
  return NextResponse.json({ status: "Webhook endpoint active" });
}
