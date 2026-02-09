import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

interface OfflineTransaction {
  client_tx_id: string;
  business_id: string;
  member_id: string;
  amount: number;
  description: string;
  occurred_at: string;
}

interface BulkSyncRequest {
  device_id: string;
  transactions: OfflineTransaction[];
}

interface TransactionResult {
  client_tx_id: string;
  status: "accepted" | "duplicate" | "rejected";
  server_transaction_id?: string;
  balance_after?: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Security: Verify KIOSK_SYNC_TOKEN header
    const token = request.headers.get("x-kiosk-token");
    const expectedToken = process.env.KIOSK_SYNC_TOKEN;

    if (!expectedToken || token !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as BulkSyncRequest;
    const { device_id, transactions } = body;

    if (!device_id || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Invalid request: device_id and transactions array required" },
        { status: 400 }
      );
    }

    if (transactions.length > 100) {
      return NextResponse.json(
        { error: "Too many transactions (max 100 per request)" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const results: TransactionResult[] = [];

    // Process each transaction using atomic database function
    for (const tx of transactions) {
      try {
        // Call atomic function that handles:
        // 1. Duplicate check (idempotency)
        // 2. Member and business validation
        // 3. Transaction insert + balance update atomically in single DB transaction
        const { data, error } = await supabase.rpc("process_kiosk_transaction", {
          p_device_id: device_id,
          p_client_tx_id: tx.client_tx_id,
          p_member_id: tx.member_id,
          p_business_id: tx.business_id,
          p_amount: tx.amount,
          p_description: tx.description,
          p_occurred_at: tx.occurred_at,
        });

        if (error) {
          results.push({
            client_tx_id: tx.client_tx_id,
            status: "rejected",
            error: error.message || "Database function error",
          });
          continue;
        }

        if (!data || !Array.isArray(data) || data.length === 0) {
          results.push({
            client_tx_id: tx.client_tx_id,
            status: "rejected",
            error: "Unexpected response from server",
          });
          continue;
        }

        const result = data[0];

        if (result.status === "accepted") {
          results.push({
            client_tx_id: tx.client_tx_id,
            status: "accepted",
            server_transaction_id: result.server_transaction_id,
            balance_after: result.balance_after,
          });
        } else if (result.status === "duplicate") {
          results.push({
            client_tx_id: tx.client_tx_id,
            status: "duplicate",
            server_transaction_id: result.server_transaction_id,
            balance_after: result.balance_after,
          });
        } else {
          results.push({
            client_tx_id: tx.client_tx_id,
            status: "rejected",
            error: result.error_message || "Unknown error",
          });
        }
      } catch (error) {
        results.push({
          client_tx_id: tx.client_tx_id,
          status: "rejected",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        device_id,
        processed: transactions.length,
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Bulk sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
