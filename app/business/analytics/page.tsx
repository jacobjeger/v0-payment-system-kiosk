"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types";
import {
  Store,
  LogOut,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Clock,
  BarChart3,
  Calendar,
  Users,
  ChevronDown,
  Filter,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface Transaction {
  id: string;
  amount: number;
  created_at: string;
  member_id: string;
}

interface BillingCycle {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
}

type FilterType = "cycle" | "1m" | "3m" | "6m" | "1y" | "all";

export default function BusinessAnalyticsPage() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBusiness();
  }, []);

  async function loadBusiness() {
    const supabase = createClient();
    const pinBusinessId = sessionStorage.getItem("business_id") || localStorage.getItem("business_id");

    let businessData: Business | null = null;

    if (pinBusinessId) {
      const { data } = await supabase.from("businesses").select("*").eq("id", pinBusinessId).single();
      businessData = data;
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/business/login");
        return;
      }
      const { data } = await supabase.from("businesses").select("*").eq("auth_user_id", user.id).single();
      businessData = data;
    }

    if (!businessData) {
      router.push("/business/login");
      return;
    }

    setBusiness(businessData);
    await loadCyclesAndSetDefault(businessData.id);
    setLoading(false);
  }

  async function loadCyclesAndSetDefault(businessId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("billing_cycles")
      .select("*")
      .order("created_at", { ascending: false });
    setCycles(data || []);
    
    // Set default filter to active cycle
    const activeCycle = data?.find(c => c.status === "active");
    if (activeCycle) {
      setFilterType("cycle");
      setSelectedCycleId(activeCycle.id);
      await loadTransactions(businessId, "cycle", activeCycle.id);
    } else {
      await loadTransactions(businessId, "all", null);
    }
  }

  async function loadTransactions(businessId: string, filter: FilterType, cycleId: string | null) {
    const supabase = createClient();
    let query = supabase.from("transactions").select("*").eq("business_id", businessId);

    if (filter === "cycle" && cycleId) {
      // Filter by billing_cycle_id for accurate results
      query = query.eq("billing_cycle_id", cycleId);
    } else if (filter !== "all") {
      const now = new Date();
      let startDate: Date;
      switch (filter) {
        case "1m":
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case "3m":
          startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
          break;
        case "6m":
          startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
          break;
        case "1y":
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          startDate = new Date(0);
      }
      query = query.gte("created_at", startDate.toISOString());
    }

    const { data } = await query.order("created_at", { ascending: true });
    setTransactions(data || []);
  }

  function handleFilterChange(filter: FilterType, cycleId?: string) {
    setFilterType(filter);
    setSelectedCycleId(cycleId || null);
    if (business) {
      loadTransactions(business.id, filter, cycleId || null);
    }
  }

  function getFilterLabel() {
    if (filterType === "cycle" && selectedCycleId) {
      const cycle = cycles.find((c) => c.id === selectedCycleId);
      return cycle?.name || "Selected Cycle";
    }
    switch (filterType) {
      case "1m": return "Last Month";
      case "3m": return "Last 3 Months";
      case "6m": return "Last 6 Months";
      case "1y": return "Last Year";
      default: return "All Time";
    }
  }

  // Calculate analytics data
  const analytics = useMemo(() => {
    if (transactions.length === 0) {
      return {
        totalSales: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
        uniqueCustomers: 0,
        salesPerDay: 0,
        priceDistribution: [],
        hourlyDistribution: [],
        dailyTrend: [],
        weekdayDistribution: [],
        topAmounts: [],
      };
    }

    const totalRevenue = transactions.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalSales = transactions.length;
    const averageOrderValue = totalRevenue / totalSales;
    const uniqueCustomers = new Set(transactions.map((t) => t.member_id)).size;

    // Calculate date range for sales per day
    const dates = transactions.map((t) => new Date(t.created_at).toDateString());
    const uniqueDays = new Set(dates).size;
    const salesPerDay = totalSales / Math.max(uniqueDays, 1);

    // Price distribution (group by price ranges)
    const priceRanges: Record<string, number> = {};
    transactions.forEach((t) => {
      const amount = Number(t.amount);
      let range: string;
      if (amount <= 5) range = "0-5";
      else if (amount <= 10) range = "6-10";
      else if (amount <= 15) range = "11-15";
      else if (amount <= 20) range = "16-20";
      else if (amount <= 30) range = "21-30";
      else if (amount <= 50) range = "31-50";
      else range = "50+";
      priceRanges[range] = (priceRanges[range] || 0) + 1;
    });
    const priceDistribution = Object.entries(priceRanges)
      .map(([range, count]) => ({ range, count, percentage: Math.round((count / totalSales) * 100) }))
      .sort((a, b) => {
        const order = ["0-5", "6-10", "11-15", "16-20", "21-30", "31-50", "50+"];
        return order.indexOf(a.range) - order.indexOf(b.range);
      });

    // Hourly distribution (busiest times)
    const hourCounts: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hourCounts[i] = 0;
    transactions.forEach((t) => {
      const hour = new Date(t.created_at).getHours();
      hourCounts[hour]++;
    });
    const hourlyDistribution = Object.entries(hourCounts).map(([hour, count]) => ({
      hour: `${hour.padStart(2, "0")}:00`,
      count,
      label: Number(hour) < 12 ? `${hour}am` : Number(hour) === 12 ? "12pm" : `${Number(hour) - 12}pm`,
    }));

    // Daily trend (sales over time)
    const dailyCounts: Record<string, { date: string; sales: number; revenue: number }> = {};
    transactions.forEach((t) => {
      const date = new Date(t.created_at).toISOString().split("T")[0];
      if (!dailyCounts[date]) {
        dailyCounts[date] = { date, sales: 0, revenue: 0 };
      }
      dailyCounts[date].sales++;
      dailyCounts[date].revenue += Number(t.amount);
    });
    const dailyTrend = Object.values(dailyCounts).sort((a, b) => a.date.localeCompare(b.date));

    // Weekday distribution
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekdayCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    transactions.forEach((t) => {
      const day = new Date(t.created_at).getDay();
      weekdayCounts[day]++;
    });
    const weekdayDistribution = weekdays.map((name, i) => ({
      day: name,
      count: weekdayCounts[i],
    }));

    // Top amounts (most common transaction amounts)
    const amountCounts: Record<number, number> = {};
    transactions.forEach((t) => {
      const amount = Math.round(Number(t.amount));
      amountCounts[amount] = (amountCounts[amount] || 0) + 1;
    });
    const topAmounts = Object.entries(amountCounts)
      .map(([amount, count]) => ({ amount: Number(amount), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalSales,
      totalRevenue,
      averageOrderValue,
      uniqueCustomers,
      salesPerDay,
      priceDistribution,
      hourlyDistribution,
      dailyTrend,
      weekdayDistribution,
      topAmounts,
    };
  }, [transactions]);

  // Find busiest hour
  const busiestHour = useMemo(() => {
    if (analytics.hourlyDistribution.length === 0) return null;
    return analytics.hourlyDistribution.reduce((max, curr) => (curr.count > max.count ? curr : max));
  }, [analytics.hourlyDistribution]);

  // Find busiest day
  const busiestDay = useMemo(() => {
    if (analytics.weekdayDistribution.length === 0) return null;
    return analytics.weekdayDistribution.reduce((max, curr) => (curr.count > max.count ? curr : max));
  }, [analytics.weekdayDistribution]);

  async function handleLogout() {
    const supabase = createClient();
    sessionStorage.clear();
    await supabase.auth.signOut();
    router.push("/business/login");
  }

  // Chart colors
  const emerald500 = "#10b981";
  const emerald400 = "#34d399";
  const emerald300 = "#6ee7b7";
  const zinc300 = "#d4d4d8";
  const zinc400 = "#a1a1aa";

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!business) return null;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/business/dashboard" className="p-2 -ml-2 hover:bg-zinc-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-zinc-500" />
            </Link>
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-zinc-900">Analytics</h1>
              <p className="text-xs text-zinc-500">{business.name}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1.5 transition-colors">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Filter */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-zinc-900">Sales Analytics</h2>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                <Filter className="w-4 h-4" />
                {getFilterLabel()}
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => handleFilterChange("all")}>All Time</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilterChange("1m")}>Last Month</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilterChange("3m")}>Last 3 Months</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilterChange("6m")}>Last 6 Months</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilterChange("1y")}>Last Year</DropdownMenuItem>
              {cycles.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <p className="px-2 py-1.5 text-xs text-zinc-500 font-medium">Billing Cycles</p>
                  {cycles.map((cycle) => (
                    <DropdownMenuItem key={cycle.id} onClick={() => handleFilterChange("cycle", cycle.id)}>
                      <span className={`w-2 h-2 rounded-full mr-2 ${cycle.status === "active" ? "bg-green-500" : "bg-zinc-300"}`} />
                      {cycle.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-zinc-500">Total Sales</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900">{analytics.totalSales}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-zinc-500">Total Revenue</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900 tabular-nums">
                {"\u20AA"}{analytics.totalRevenue.toLocaleString("en-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-zinc-500">Avg. Order</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900 tabular-nums">
                {"\u20AA"}{analytics.averageOrderValue.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-zinc-500">Unique Customers</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900">{analytics.uniqueCustomers}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span className="text-xs text-zinc-500">Sales/Day</span>
              </div>
              <p className="text-2xl font-bold text-zinc-900">{analytics.salesPerDay.toFixed(1)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Busiest Times Summary */}
        {(busiestHour || busiestDay) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {busiestHour && busiestHour.count > 0 && (
              <Card className="bg-emerald-50 border-emerald-100">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-emerald-700">Busiest Hour</p>
                      <p className="text-xl font-bold text-emerald-900">{busiestHour.label}</p>
                      <p className="text-xs text-emerald-600">{busiestHour.count} transactions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {busiestDay && busiestDay.count > 0 && (
              <Card className="bg-emerald-50 border-emerald-100">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm text-emerald-700">Busiest Day</p>
                      <p className="text-xl font-bold text-emerald-900">{busiestDay.day}</p>
                      <p className="text-xs text-emerald-600">{busiestDay.count} transactions</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Daily Sales Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sales Trend</CardTitle>
              <CardDescription>Daily sales and revenue over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  sales: { label: "Sales", color: emerald500 },
                  revenue: { label: "Revenue", color: emerald300 },
                }}
                className="h-[250px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.dailyTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={zinc300} />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 11 }} 
                      tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="sales" stroke={emerald500} fill={emerald300} fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Price Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Price Distribution</CardTitle>
              <CardDescription>Transactions by amount range</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  count: { label: "Transactions", color: emerald500 },
                }}
                className="h-[250px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.priceDistribution} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={zinc300} />
                    <XAxis dataKey="range" tick={{ fontSize: 11 }} tickFormatter={(v) => `₪${v}`} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill={emerald500} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Hourly Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hourly Activity</CardTitle>
              <CardDescription>Sales by hour of day</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  count: { label: "Transactions", color: emerald500 },
                }}
                className="h-[250px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.hourlyDistribution} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={zinc300} />
                    <XAxis 
                      dataKey="hour" 
                      tick={{ fontSize: 10 }} 
                      interval={2}
                      tickFormatter={(v) => v.split(":")[0]}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill={emerald400} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Weekday Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Day of Week</CardTitle>
              <CardDescription>Sales by day of week</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  count: { label: "Transactions", color: emerald500 },
                }}
                className="h-[250px]"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.weekdayDistribution} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={zinc300} />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill={emerald500} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Top Amounts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Most Common Amounts</CardTitle>
            <CardDescription>Top 10 most frequent transaction amounts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {analytics.topAmounts.map((item, i) => (
                <div
                  key={item.amount}
                  className={`p-3 rounded-lg border ${
                    i === 0 ? "bg-emerald-50 border-emerald-200" : "bg-white border-zinc-200"
                  }`}
                >
                  <p className={`text-lg font-bold ${i === 0 ? "text-emerald-700" : "text-zinc-900"}`}>
                    {"\u20AA"}{item.amount}
                  </p>
                  <p className={`text-xs ${i === 0 ? "text-emerald-600" : "text-zinc-500"}`}>
                    {item.count} sales ({Math.round((item.count / analytics.totalSales) * 100)}%)
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
