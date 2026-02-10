"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types";
import { AddTransactionDialog } from "@/components/business/add-transaction-dialog";
import { DailyTotalsChart } from "@/components/business/daily-totals-chart";
import { TransactionFlow } from "@/components/business/transaction-flow";
import { 
  Receipt, 
  Settings, 
  LogOut, 
  ArrowUpRight, 
  TrendingUp, 
  Store,
  ChevronDown,
  Calendar,
  DollarSign,
  Percent,
  Filter,
  BarChart3,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BillingCycle {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
}

type FilterType = "cycle" | "1m" | "3m" | "6m" | "1y" | "all";

export default function BusinessDashboard() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [stats, setStats] = useState({ 
    revenue: 0, 
    transactionCount: 0,
    feePercentage: 0,
    feeAmount: 0,
    netRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showTransactionFlow, setShowTransactionFlow] = useState(false);

  useEffect(() => { loadBusiness(); }, []);

  useEffect(() => {
    // Listen for business preference changes
    if (!business?.id) return;
    
    const supabase = createClient();
    const subscription = supabase
      .channel(`business-${business.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "businesses",
          filter: `id=eq.${business.id}`,
        },
        (payload) => {
          const updatedBusiness = payload.new as Business;
          setBusiness(updatedBusiness);
          // Refresh the chart when preferences change
          if (updatedBusiness.active_days_average !== business.active_days_average) {
            console.log("[v0] Active days preference changed, chart will refresh");
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [business?.id]);

  async function loadBusiness() {
    const supabase = createClient();
    // Check both sessionStorage and localStorage for business_id
    const pinBusinessId = sessionStorage.getItem("business_id") || localStorage.getItem("business_id");
    
    if (pinBusinessId) {
      const { data } = await supabase.from("businesses").select("*").eq("id", pinBusinessId).single();
      if (data) { 
        setBusiness(data);
        await loadCyclesWithBusiness(data);
      }
      else { 
        sessionStorage.clear(); 
        localStorage.removeItem("business_id");
        localStorage.removeItem("business_name");
        router.push("/business/login"); 
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/business/login"); return; }
      const { data } = await supabase.from("businesses").select("*").eq("auth_user_id", user.id).single();
      if (data) { 
        setBusiness(data);
        await loadCyclesWithBusiness(data);
      }
      else { router.push("/business/login"); }
    }
    setLoading(false);
  }

  async function loadCyclesWithBusiness(businessData: Business) {
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
      await loadStats(businessData.id, Number(businessData.fee_percentage) || 0, "cycle", activeCycle.id);
    } else {
      await loadStats(businessData.id, Number(businessData.fee_percentage) || 0, "all", null);
    }
  }

  async function loadStats(businessId: string, feePercentage: number, filter: FilterType, cycleId: string | null) {
    const supabase = createClient();
    
    let baseQuery = supabase.from("transactions").select("amount, created_at").eq("business_id", businessId);
    
    if (filter === "cycle" && cycleId) {
      baseQuery = baseQuery.eq("billing_cycle_id", cycleId);
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
      
      baseQuery = baseQuery.gte("created_at", startDate.toISOString());
    }
    
    // Fetch all transactions with pagination for >1000 rows
    let allTransactions: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: batch } = await baseQuery.range(offset, offset + 999);
      
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
    
    const revenue = allTransactions.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    const feeAmount = revenue * (feePercentage / 100);
    const netRevenue = revenue - feeAmount;

    setStats({
      revenue,
      transactionCount: allTransactions.length,
      feePercentage,
      feeAmount,
      netRevenue,
    });
  }

  function handleFilterChange(filter: FilterType, cycleId?: string) {
    setFilterType(filter);
    setSelectedCycleId(cycleId || null);
    if (business) {
      loadStats(business.id, Number(business.fee_percentage) || 0, filter, cycleId || null);
    }
  }

  function getFilterLabel() {
    if (filterType === "cycle" && selectedCycleId) {
      const cycle = cycles.find(c => c.id === selectedCycleId);
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

  async function handleLogout() {
    const supabase = createClient();
    sessionStorage.clear();
    localStorage.removeItem("business_id");
    localStorage.removeItem("business_name");
    await supabase.auth.signOut();
    router.push("/business/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!business) return null;

  return (
    <div className="min-h-screen bg-[#fafaf8]">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <Store className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-zinc-900">{business.name}</h1>
              <p className="text-xs text-zinc-500">Business Portal</p>
            </div>
          </div>
          <button onClick={handleLogout} className="text-sm text-zinc-500 hover:text-zinc-700 flex items-center gap-1.5 transition-colors">
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Add Transaction Button - Show flow or dialog based on preference */}
        {business.can_add_transactions && !showTransactionFlow && (
          <div className="mb-6 flex gap-2">
            <button
              onClick={() => setShowTransactionFlow(true)}
              className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
            >
              + Add Transaction
            </button>
          </div>
        )}

        {/* Transaction Flow Dialog */}
        {showTransactionFlow && business && (
          <div className="mb-6 p-6 bg-white rounded-lg border border-zinc-200">
            <TransactionFlow
              business={business}
              onSuccess={() => {
                setShowTransactionFlow(false);
                loadStats(business.id, Number(business.fee_percentage) || 0, filterType, selectedCycleId);
              }}
              onCancel={() => setShowTransactionFlow(false)}
            />
          </div>
        )}

        {/* Filter Dropdown */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              business.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${business.is_active ? "bg-emerald-500" : "bg-red-500"}`} />
              {business.is_active ? "Active" : "Inactive"}
            </span>
            {stats.feePercentage > 0 && (
              <span className="text-xs text-zinc-500">{stats.feePercentage}% PDCA fee</span>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                <Filter className="w-4 h-4" />
                {getFilterLabel()}
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => handleFilterChange("all")}>
                <Calendar className="w-4 h-4 mr-2" />
                All Time
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilterChange("1m")}>
                <Calendar className="w-4 h-4 mr-2" />
                Last Month
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilterChange("3m")}>
                <Calendar className="w-4 h-4 mr-2" />
                Last 3 Months
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilterChange("6m")}>
                <Calendar className="w-4 h-4 mr-2" />
                Last 6 Months
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleFilterChange("1y")}>
                <Calendar className="w-4 h-4 mr-2" />
                Last Year
              </DropdownMenuItem>
              
              {cycles.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <p className="px-2 py-1.5 text-xs text-zinc-500 font-medium">Billing Cycles</p>
                  {cycles.map(cycle => (
                    <DropdownMenuItem 
                      key={cycle.id}
                      onClick={() => handleFilterChange("cycle", cycle.id)}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span className={`w-2 h-2 rounded-full ${
                          cycle.status === "active" ? "bg-green-500" : "bg-zinc-300"
                        }`} />
                        <span className="flex-1">{cycle.name}</span>
                        {cycle.status === "active" && (
                          <span className="text-xs text-emerald-600">Current</span>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
            </DropdownMenu>
        </div>

        {/* Daily Totals Chart */}
        <div className="mb-6">
          <DailyTotalsChart businessId={business.id} activeDaysAverage={business.active_days_average || false} />
        </div>

        {/* Revenue Stats */}
        <div className="grid grid-cols-1 gap-4 mb-6">
          {/* Total Revenue Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-zinc-900 to-zinc-800 text-white">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="w-5 h-5 text-zinc-400" />
              <p className="text-sm text-zinc-400">Total Revenue</p>
            </div>
            <p className="text-4xl font-bold tabular-nums mb-1">
              {"\u20AA"}{stats.revenue.toLocaleString('en-IL', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-zinc-500">{stats.transactionCount} transactions</p>
          </div>

          {/* Fee Breakdown */}
          {stats.feePercentage > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-white border border-zinc-200">
                <div className="flex items-center gap-2 mb-3">
                  <Percent className="w-4 h-4 text-amber-500" />
                  <p className="text-sm text-zinc-500">PDCA Fee ({stats.feePercentage}%)</p>
                </div>
                <p className="text-2xl font-semibold text-amber-600 tabular-nums">
                  -{"\u20AA"}{stats.feeAmount.toLocaleString('en-IL', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-100">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <p className="text-sm text-emerald-700">Net Revenue</p>
                </div>
                <p className="text-2xl font-semibold text-emerald-700 tabular-nums">
                  {"\u20AA"}{stats.netRevenue.toLocaleString('en-IL', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="grid sm:grid-cols-3 gap-3">
          <Link href="/business/analytics" className="group">
            <div className="p-4 rounded-xl bg-white border border-zinc-200 hover:border-emerald-300 transition-all flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
                <BarChart3 className="w-5 h-5 text-zinc-500 group-hover:text-emerald-600 transition-colors" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-zinc-900 text-sm">Analytics</p>
                <p className="text-xs text-zinc-500">View insights</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>

          <Link href="/business/transactions" className="group">
            <div className="p-4 rounded-xl bg-white border border-zinc-200 hover:border-emerald-300 transition-all flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
                <Receipt className="w-5 h-5 text-zinc-500 group-hover:text-emerald-600 transition-colors" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-zinc-900 text-sm">Transactions</p>
                <p className="text-xs text-zinc-500">View history</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>

          <Link href="/business/settings" className="group">
            <div className="p-4 rounded-xl bg-white border border-zinc-200 hover:border-emerald-300 transition-all flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-zinc-100 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
                <Settings className="w-5 h-5 text-zinc-500 group-hover:text-emerald-600 transition-colors" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-zinc-900 text-sm">Settings</p>
                <p className="text-xs text-zinc-500">Configure business</p>
              </div>
              <ArrowUpRight className="w-4 h-4 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </Link>
        </div>
      </main>
    </div>
  );
}
