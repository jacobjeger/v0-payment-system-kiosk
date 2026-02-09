import { createAdminClient } from "@/lib/supabase/server";
import { AdminOverviewClient } from "@/components/admin/admin-overview-client";

// Revalidate data every 5 seconds for real-time updates
export const revalidate = 5;

export default async function AdminPage() {
  const supabase = createAdminClient();

  // First, get the active billing cycle
  const { data: activeCycle } = await supabase
    .from("billing_cycles")
    .select("*")
    .eq("status", "active")
    .single();

  const [
    { count: businessCount },
    { count: memberCount },
    { data: recentTransactions },
    { data: todayStats },
    { data: cycles },
    { data: cycleTransactions },
    { count: pendingDisputesCount },
    { count: pendingCardChangesCount },
  ] = await Promise.all([
    supabase.from("businesses").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("members").select("*", { count: "exact", head: true }).neq("status", "deleted"),
    // Recent transactions - only from active billing cycle
    activeCycle
      ? supabase
          .from("transactions")
          .select(`id, amount, description, created_at, member_id, business_id, members ( first_name, last_name ), businesses ( name )`)
          .eq("billing_cycle_id", activeCycle.id)
          .order("created_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] }),
    // Today's stats - only from active billing cycle
    activeCycle
      ? supabase
          .from("transactions")
          .select("amount")
          .eq("billing_cycle_id", activeCycle.id)
          .gte("created_at", new Date().toISOString().split("T")[0] + "T00:00:00.000Z")
      : Promise.resolve({ data: [] }),
    supabase
      .from("billing_cycles")
      .select("*")
      .order("created_at", { ascending: false }),
    // Current cycle total transactions
    activeCycle
      ? supabase
          .from("transactions")
          .select("amount")
          .eq("billing_cycle_id", activeCycle.id)
      : Promise.resolve({ data: [] }),
    supabase
      .from("transaction_reviews")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("pending_card_changes")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  
  const cycleTotal = cycleTransactions?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
  const cycleCount = cycleTransactions?.length || 0;

  const todayTotal = todayStats?.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
  const todayCount = todayStats?.length || 0;

  return (
    <AdminOverviewClient
      businessCount={businessCount || 0}
      memberCount={memberCount || 0}
      todayTotal={todayTotal}
      todayCount={todayCount}
      cycleTotal={cycleTotal}
      cycleCount={cycleCount}
      recentTransactions={(recentTransactions || []).map(tx => ({
        id: tx.id,
        amount: tx.amount,
        description: tx.description,
        created_at: tx.created_at,
        members: tx.members as { first_name: string; last_name: string } | null,
        businesses: tx.businesses as { name: string } | null,
      }))}
      cycles={cycles || []}
      activeCycle={activeCycle}
      pendingDisputesCount={pendingDisputesCount || 0}
      pendingCardChangesCount={pendingCardChangesCount || 0}
    />
  );
}
