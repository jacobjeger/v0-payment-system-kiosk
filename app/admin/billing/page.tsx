import { createAdminClient } from "@/lib/supabase/server";
import { BillingOverview } from "@/components/admin/billing-overview";

export default async function BillingPage() {
  const supabase = createAdminClient();

  // Get current month dates
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  // Fetch all members with their transaction totals for current month
  const { data: members } = await supabase
    .from("members")
    .select("id, first_name, last_name, email, balance")
    .eq("is_active", true)
    .order("last_name", { ascending: true });

  // Fetch transactions for current month
  const { data: currentMonthTransactions } = await supabase
    .from("transactions")
    .select(`
      id,
      member_id,
      amount,
      description,
      created_at,
      businesses ( name )
    `)
    .gte("created_at", currentMonthStart.toISOString())
    .lte("created_at", currentMonthEnd.toISOString())
    .order("created_at", { ascending: false });

  // Fetch transactions for last month
  const { data: lastMonthTransactions } = await supabase
    .from("transactions")
    .select("member_id, amount")
    .gte("created_at", lastMonthStart.toISOString())
    .lte("created_at", lastMonthEnd.toISOString());

  // Group transactions by member for current month
  const memberTotals = new Map<string, { total: number; count: number }>();
  currentMonthTransactions?.forEach((tx) => {
    const existing = memberTotals.get(tx.member_id) || { total: 0, count: 0 };
    memberTotals.set(tx.member_id, {
      total: existing.total + Number(tx.amount),
      count: existing.count + 1,
    });
  });

  // Group transactions by member for last month
  const lastMonthTotals = new Map<string, number>();
  lastMonthTransactions?.forEach((tx) => {
    const existing = lastMonthTotals.get(tx.member_id) || 0;
    lastMonthTotals.set(tx.member_id, existing + Number(tx.amount));
  });

  // Build member billing data
  const memberBillingData = members?.map((member) => {
    const currentMonth = memberTotals.get(member.id) || { total: 0, count: 0 };
    const lastMonth = lastMonthTotals.get(member.id) || 0;

    return {
      id: member.id,
      firstName: member.first_name,
      lastName: member.last_name,
      email: member.email,
      balance: Number(member.balance),
      currentMonthTotal: currentMonth.total,
      currentMonthCount: currentMonth.count,
      lastMonthTotal: lastMonth,
    };
  }) || [];

  // Calculate overall stats
  const totalCurrentMonth = currentMonthTransactions?.reduce(
    (sum, tx) => sum + Number(tx.amount),
    0
  ) || 0;
  const totalLastMonth = lastMonthTransactions?.reduce(
    (sum, tx) => sum + Number(tx.amount),
    0
  ) || 0;
  const totalTransactions = currentMonthTransactions?.length || 0;
  const activeMembers = memberTotals.size;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Monthly billing statements and member balances
        </p>
      </div>

      <BillingOverview
        memberBillingData={memberBillingData}
        currentMonthTransactions={currentMonthTransactions || []}
        stats={{
          totalCurrentMonth,
          totalLastMonth,
          totalTransactions,
          activeMembers,
          currentMonthName: currentMonthStart.toLocaleString("default", { month: "long", year: "numeric" }),
          lastMonthName: lastMonthStart.toLocaleString("default", { month: "long", year: "numeric" }),
        }}
      />
    </div>
  );
}
