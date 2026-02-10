"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { 
  Store, 
  Users, 
  Receipt, 
  TrendingUp, 
  ArrowUpRight,
  Filter,
  ChevronDown,
  Calendar,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Transaction7DayChart } from "./transaction-7day-chart";

interface BillingCycle {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
}

interface Props {
  businessCount: number;
  memberCount: number;
  todayTotal: number;
  todayCount: number;
  cycleTotal: number;
  cycleCount: number;
  recentTransactions: Array<{
    id: string;
    amount: number;
    description: string;
    created_at: string;
    members: { first_name: string; last_name: string } | null;
    businesses: { name: string } | null;
  }>;
  cycles: BillingCycle[];
  activeCycle: BillingCycle | null;
  pendingDisputesCount: number;
  pendingCardChangesCount: number;
}

type FilterType = "cycle" | "1m" | "3m" | "6m" | "1y" | "all";

export function AdminOverviewClient({ 
  businessCount, 
  memberCount, 
  todayTotal, 
  todayCount,
  cycleTotal,
  cycleCount,
  recentTransactions,
  cycles,
  activeCycle,
  pendingDisputesCount,
  pendingCardChangesCount,
}: Props) {
  const [filterType, setFilterType] = useState<FilterType>("cycle");
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(activeCycle?.id || null);
  const [cycleStats, setCycleStats] = useState({ total: cycleTotal, count: cycleCount });
  const [todayFilteredStats, setTodayFilteredStats] = useState({ total: todayTotal, count: todayCount });
  const [loading, setLoading] = useState(false);

  // Separate active and closed cycles
  const activeCycles = cycles.filter(c => c.status === "active");
  const closedCycles = cycles.filter(c => c.status === "closed");

  useEffect(() => {
    if (activeCycle) {
      setSelectedCycleId(activeCycle.id);
      setFilterType("cycle");
      loadStats("cycle", activeCycle.id);
    } else {
      // No active cycle - default to all time view
      setFilterType("all");
      setSelectedCycleId(null);
      loadStats("all", null);
    }
  }, [activeCycle]);

  async function loadStats(filter: FilterType, cycleId: string | null) {
    setLoading(true);
    const supabase = createClient();
    
    let baseQuery = supabase.from("transactions").select("amount, created_at, billing_cycle_id");
    
    if (filter === "cycle" && cycleId) {
      // Use billing_cycle_id for accurate filtering
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
      const { data: batch, error } = await baseQuery.range(offset, offset + 999);
      
      if (error) {
        console.error("Error loading stats:", error);
        setCycleStats({ total: 0, count: 0 });
        setTodayFilteredStats({ total: 0, count: 0 });
        setLoading(false);
        return;
      }

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
    
    const total = allTransactions.reduce((sum, t) => sum + Number(t.amount), 0) || 0;
    setCycleStats({ total, count: allTransactions.length });
    
    // Calculate today's stats within the filtered results
    const todayStart = new Date().toISOString().split("T")[0] + "T00:00:00.000Z";
    const todayTransactions = allTransactions.filter(t => t.created_at >= todayStart) || [];
    const todayTotal = todayTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
    setTodayFilteredStats({ total: todayTotal, count: todayTransactions.length });
    
    setLoading(false);
  }

  function handleFilterChange(filter: FilterType, cycleId?: string) {
    setFilterType(filter);
    setSelectedCycleId(cycleId || null);
    loadStats(filter, cycleId || null);
  }

  function getFilterLabel() {
    if (filterType === "cycle" && selectedCycleId) {
      const cycle = cycles.find(c => c.id === selectedCycleId);
      if (cycle) {
        return cycle.status === "closed" ? `${cycle.name} (Closed)` : cycle.name;
      }
      return "Selected Cycle";
    }
    switch (filterType) {
      case "1m": return "Last Month";
      case "3m": return "Last 3 Months";
      case "6m": return "Last 6 Months";
      case "1y": return "Last Year";
      default: return "All Time";
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Filter */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Overview</h1>
          <p className="text-sm text-stone-500 mt-1">Your payment system at a glance</p>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors">
              <Filter className="w-4 h-4" />
              {getFilterLabel()}
              <ChevronDown className="w-4 h-4 text-stone-400" />
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
            
            {activeCycles.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs text-stone-500 font-medium">Active Cycles</p>
                {activeCycles.map(cycle => (
                  <DropdownMenuItem 
                    key={cycle.id}
                    onClick={() => handleFilterChange("cycle", cycle.id)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="flex-1">{cycle.name}</span>
                      <span className="text-xs text-emerald-600">Current</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
            
            {closedCycles.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs text-stone-400 font-medium">Closed Cycles</p>
                {closedCycles.slice(0, 5).map(cycle => (
                  <DropdownMenuItem 
                    key={cycle.id}
                    onClick={() => handleFilterChange("cycle", cycle.id)}
                    className="text-stone-500"
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className="w-2 h-2 rounded-full bg-stone-300" />
                      <span className="flex-1">{cycle.name}</span>
                      <span className="text-xs text-stone-400">Closed</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Pending Alerts */}
      {(pendingDisputesCount > 0 || pendingCardChangesCount > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pendingDisputesCount > 0 && (
            <Link href="/admin/reviews">
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 hover:border-amber-300 transition-all flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-amber-900">{pendingDisputesCount} Pending Dispute{pendingDisputesCount !== 1 ? 's' : ''}</p>
                  <p className="text-sm text-amber-700">Review transaction disputes from businesses</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-amber-400 flex-shrink-0" />
              </div>
            </Link>
          )}
          
          {pendingCardChangesCount > 0 && (
            <Link href="/admin/billing/declined">
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 hover:border-blue-300 transition-all flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-blue-900">{pendingCardChangesCount} Card Request{pendingCardChangesCount !== 1 ? 's' : ''}</p>
                  <p className="text-sm text-blue-700">Members submitted new card information</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/admin/businesses" className="group">
          <div className="p-5 rounded-xl bg-white border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center">
                <Store className="w-5 h-5 text-stone-600" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-2xl font-semibold text-stone-900 tabular-nums">{businessCount || 0}</p>
            <p className="text-sm text-stone-500 mt-1">Businesses</p>
          </div>
        </Link>

        <Link href="/admin/members" className="group">
          <div className="p-5 rounded-xl bg-white border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center">
                <Users className="w-5 h-5 text-stone-600" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-2xl font-semibold text-stone-900 tabular-nums">{memberCount || 0}</p>
            <p className="text-sm text-stone-500 mt-1">Members</p>
          </div>
        </Link>

        <Link href="/admin/transactions" className="group">
          <div className="p-5 rounded-xl bg-white border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-stone-600" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-2xl font-semibold text-stone-900 tabular-nums">{loading ? "..." : todayFilteredStats.count}</p>
            <p className="text-sm text-stone-500 mt-1">Today</p>
          </div>
        </Link>

        <Link href="/admin/billing/cycles" className="group">
          <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-100 hover:border-emerald-200 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-emerald-300 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <p className="text-2xl font-semibold text-emerald-700 tabular-nums">
              {loading ? "..." : `₪${cycleStats.total.toLocaleString('en-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            </p>
            <p className="text-sm text-emerald-600 mt-1">{getFilterLabel()}</p>
          </div>
        </Link>
      </div>

      {/* Period Summary */}
      <div className="p-6 rounded-xl bg-stone-900 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-stone-400 mb-1">Today's revenue</p>
            <p className="text-3xl font-semibold tabular-nums">
              {loading ? "..." : `₪${todayFilteredStats.total.toLocaleString('en-IL', { minimumFractionDigits: 2 })}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-stone-400 mb-1">{getFilterLabel()} total</p>
            <p className="text-3xl font-semibold tabular-nums">
              {loading ? "..." : `₪${cycleStats.total.toLocaleString('en-IL', { minimumFractionDigits: 2 })}`}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-stone-700 flex items-center justify-between text-sm">
          <span className="text-stone-400">Transactions today: {loading ? "..." : todayFilteredStats.count}</span>
          <span className="text-stone-400">{getFilterLabel()}: {loading ? "..." : cycleStats.count} transactions</span>
        </div>
      </div>

      {/* 7-Day Transaction Chart */}
      <Transaction7DayChart />

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-stone-500">Recent transactions</h2>
          <Link href="/admin/transactions" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">
            View all
          </Link>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          {recentTransactions && recentTransactions.length > 0 ? (
            <div className="divide-y divide-stone-100">
              {recentTransactions.map((tx) => {
                const member = tx.members;
                const business = tx.businesses;
                return (
                  <div key={tx.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-stone-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center">
                        <span className="text-xs font-medium text-stone-600">
                          {member?.first_name?.charAt(0)}{member?.last_name?.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-stone-900">
                          {member?.first_name} {member?.last_name}
                        </p>
                        <p className="text-xs text-stone-500">{business?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-stone-900 tabular-nums">
                        ₪{Number(tx.amount).toFixed(2)}
                      </p>
                      <p className="text-xs text-stone-500">
                        {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <p className="text-sm text-stone-500">No transactions yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
