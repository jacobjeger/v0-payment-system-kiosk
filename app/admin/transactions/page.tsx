import { createAdminClient } from "@/lib/supabase/server";
import { TransactionList } from "@/components/admin/transaction-list";

// Revalidate data every 5 seconds for real-time updates
export const revalidate = 5;

export default async function TransactionsPage() {
  const supabase = createAdminClient();

  // Get all billing cycles for the filter dropdown
  const { data: billingCycles } = await supabase
    .from("billing_cycles")
    .select("id, name, status, start_date, end_date")
    .order("created_at", { ascending: false });

  // Find the active cycle
  const activeCycle = billingCycles?.find(c => c.status === "active");

  // Get all transactions with pagination to handle >1000 rows
  let allTransactions: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: batch } = await supabase
      .from("transactions")
      .select(`
        id,
        amount,
        balance_before,
        balance_after,
        description,
        created_at,
        billing_cycle_id,
        members ( id, first_name, last_name, member_code ),
        businesses ( id, name )
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + 999);

    if (!batch || batch.length === 0) {
      hasMore = false;
    } else {
      allTransactions = allTransactions.concat(batch);
      offset += 1000;
      if (batch.length < 1000) {
        hasMore = false;
      }
    }
  }

  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });

  const { data: members } = await supabase
    .from("members")
    .select("id, first_name, last_name, member_code")
    .eq("status", "active")
    .order("first_name", { ascending: true });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Transactions</h1>
        <p className="text-muted-foreground mt-1">
          View all payment transactions
        </p>
      </div>

      <TransactionList
        transactions={allTransactions || []}
        businesses={businesses || []}
        billingCycles={billingCycles || []}
        activeCycleId={activeCycle?.id || null}
        members={members || []}
      />
    </div>
  );
}
