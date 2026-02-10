"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Receipt, 
  CreditCard, 
  LogOut, 
  Settings,
  ChevronDown,
  Calendar,
  Filter,
  AlertTriangle,
  Wallet,
  KeyRound,
  Flag,
  Check,
  Loader2,
  Shield
} from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateMemberPin, submitTransactionDispute, getMemberCardLast4, getMemberDisputes, submitNewCard, requestRetryCharge } from "@/app/actions/member";

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  balance: number;
  card_number: string | null;
  card_status?: string;
  pin_code?: string | null;
}

interface BillingCycle {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
}

interface Transaction {
  id: string;
  amount: number;
  description: string;
  created_at: string;
  business: { name: string };
}

type FilterType = "cycle" | "1m" | "3m" | "6m" | "1y" | "all";

export default function MemberDashboardPage() {
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [currentCycle, setCurrentCycle] = useState<BillingCycle | null>(null);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>("cycle");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, count: 0 });
  const [cardLast4, setCardLast4] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);

  // PIN change state
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);

  // Dispute state
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [disputeTransaction, setDisputeTransaction] = useState<Transaction | null>(null);
  const [disputeReason, setDisputeReason] = useState("");
  const [submittingDispute, setSubmittingDispute] = useState(false);
  const [disputeSuccess, setDisputeSuccess] = useState(false);
  const [disputeError, setDisputeError] = useState("");
  const [myDisputes, setMyDisputes] = useState<Array<{
    id: string;
    reason: string;
    status: string;
    admin_notes: string | null;
    created_at: string;
    resolved_at: string | null;
    transactions: {
      id: string;
      amount: number;
      description: string;
      created_at: string;
      businesses: { name: string } | null;
    } | null;
  }>>([]);

  // Card update state
  const [showCardUpdateDialog, setShowCardUpdateDialog] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardZip, setCardZip] = useState("");
  const [submittingCard, setSubmittingCard] = useState(false);
  const [cardError, setCardError] = useState("");
  const [cardSuccess, setCardSuccess] = useState(false);
  
  // Retry charge state
  const [submittingRetry, setSubmittingRetry] = useState(false);
  const [retrySuccess, setRetrySuccess] = useState(false);;

  useEffect(() => { checkAuth(); }, []);

async function checkAuth() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push("/member/login");
      return;
    }
    
    // Check if user is admin
    if (user.user_metadata?.role === "admin") {
      setIsAdmin(true);
    }

    // Get member data
    const memberId = user.user_metadata?.member_id;
    if (!memberId) {
      router.push("/member/login");
      return;
    }

    const { data: memberData } = await supabase
      .from("members")
      .select("*")
      .eq("id", memberId)
      .single();

    if (!memberData) {
      router.push("/member/login");
      return;
    }

    setMember(memberData);
    
    // Load decrypted card last 4 digits
    if (memberData.card_number) {
      const last4 = await getMemberCardLast4(memberData.id);
      setCardLast4(last4);
    }
    
    // Load member's disputes
    const disputesResult = await getMemberDisputes(memberData.id);
    if (disputesResult.success) {
      setMyDisputes(disputesResult.data as typeof myDisputes);
    }
    
    // Load cycles first
    const { data: cyclesData } = await supabase
      .from("billing_cycles")
      .select("*")
      .order("created_at", { ascending: false });
    
    const loadedCycles = cyclesData || [];
    setCycles(loadedCycles);
    
    // Find current active cycle
    const activeCycle = loadedCycles.find(c => c.status === "active");
    if (activeCycle) {
      setCurrentCycle(activeCycle);
      setSelectedCycleId(activeCycle.id);
      // Default to current cycle
      await loadTransactionsForCycle(memberData.id, activeCycle);
    } else {
      // No current cycle, show all time
      setFilterType("all");
      await loadTransactions(memberData.id, "all", null, loadedCycles);
    }
    
    setLoading(false);
  }

  async function loadTransactionsForCycle(memberId: string, cycle: BillingCycle) {
    const supabase = createClient();
    
    // Use billing_cycle_id for accurate filtering
    const { data: txData } = await supabase
      .from("transactions")
      .select(`id, amount, description, created_at, business:businesses(name)`)
      .eq("member_id", memberId)
      .eq("billing_cycle_id", cycle.id)
      .order("created_at", { ascending: false })
      .limit(50);
    
    const txs = (txData || []) as unknown as Transaction[];
    setTransactions(txs);
    
    const total = txs.reduce((sum, tx) => sum + Number(tx.amount), 0);
    setStats({ total, count: txs.length });
  }

  async function loadTransactions(memberId: string, filter: FilterType, cycleId: string | null, cyclesList?: BillingCycle[]) {
    const supabase = createClient();
    const cyclesToUse = cyclesList || cycles;
    
    let baseQuery = supabase
      .from("transactions")
      .select(`id, amount, description, created_at, business:businesses(name)`)
      .eq("member_id", memberId)
      .order("created_at", { ascending: false });

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

    // Fetch all transactions with pagination for accurate stats, then limit display to 50
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

    // Display only first 50 transactions
    const displayTransactions = allTransactions.slice(0, 50);
    const txs = displayTransactions as unknown as Transaction[];
    setTransactions(txs);

    // Calculate stats from all transactions
    const total = allTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
    setStats({ total, count: allTransactions.length });
  }

  function handleFilterChange(filter: FilterType, cycleId?: string) {
    setFilterType(filter);
    setSelectedCycleId(cycleId || null);
    if (member) {
      loadTransactions(member.id, filter, cycleId || null);
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

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/member/login");
  }

  async function handlePinChange() {
    if (!member) return;
    setPinError("");
    
    if (!/^\d{4}$/.test(newPin)) {
      setPinError("PIN must be exactly 4 digits");
      return;
    }
    
    if (newPin !== confirmPin) {
      setPinError("PINs do not match");
      return;
    }
    
    setSavingPin(true);
    const result = await updateMemberPin(member.id, newPin);
    
    if (result.success) {
      setPinSuccess(true);
      setTimeout(() => {
        setShowPinDialog(false);
        setNewPin("");
        setConfirmPin("");
        setPinSuccess(false);
      }, 1500);
    } else {
      setPinError(result.error || "Failed to update PIN");
    }
    setSavingPin(false);
  }

  async function handleSubmitDispute() {
    if (!member || !disputeTransaction) return;
    
    if (!disputeReason.trim()) return;
    
    setSubmittingDispute(true);
    setDisputeError("");
    
    const result = await submitTransactionDispute({
      transactionId: disputeTransaction.id,
      memberId: member.id,
      reason: disputeReason,
    });
    
    if (result.success) {
      setDisputeSuccess(true);
      // Reload disputes
      const disputesResult = await getMemberDisputes(member.id);
      if (disputesResult.success) {
        setMyDisputes(disputesResult.data as typeof myDisputes);
      }
      setTimeout(() => {
        setShowDisputeDialog(false);
        setDisputeTransaction(null);
        setDisputeReason("");
        setDisputeSuccess(false);
      }, 1500);
    } else {
      setDisputeError(result.error || "Failed to submit dispute");
    }
    setSubmittingDispute(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafaf8] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
          <p className="text-zinc-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!member) return null;

  return (
    <div className="min-h-screen bg-[#fafaf8]">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
              <span className="text-xs font-semibold text-blue-700">{member.first_name[0]}{member.last_name[0]}</span>
            </div>
            <div>
              <h1 className="text-base font-semibold text-zinc-900">{member.first_name} {member.last_name}</h1>
              <p className="text-xs text-zinc-500">{member.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Link 
                href="/admin" 
                className="p-2 text-amber-600 hover:text-amber-700 rounded-lg hover:bg-amber-50 transition-colors"
                title="Admin Panel"
              >
                <Shield className="w-4 h-4" />
              </Link>
            )}
            <Link href="/member/profile" className="p-2 text-zinc-500 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors">
              <Settings className="w-4 h-4" />
            </Link>
            <button onClick={handleSignOut} className="p-2 text-zinc-500 hover:text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Card Status Warning */}
        {member.card_status === "declined" && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-red-800">Payment Card Declined</p>
                <p className="text-sm text-red-700 mt-1">Your card was declined. Your account will be restricted if not resolved within 72 hours.</p>
                <div className="flex gap-2 mt-3">
                  <Button
                    onClick={async () => {
                      console.log("[v0] Retry charge button clicked");
                      setSubmittingRetry(true);
                      const result = await requestRetryCharge(member.id);
                      console.log("[v0] Retry charge result:", result);
                      if (result.success) {
                        setRetrySuccess(true);
                        setTimeout(() => {
                          setRetrySuccess(false);
                        }, 2000);
                      }
                      setSubmittingRetry(false);
                    }}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    disabled={submittingRetry || retrySuccess}
                  >
                    {submittingRetry && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    {retrySuccess ? "✓ Request Sent" : "Retry Payment"}
                  </Button>
                  <Button
                    onClick={() => {
                      console.log("[v0] Update Payment Method button clicked");
                      setShowCardUpdateDialog(true);
                    }}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Update Card
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter & Balance */}
        <div className="flex items-center justify-between mb-6">
          {/* Only show balance if there's an active cycle */}
          {currentCycle && currentCycle.status === "active" ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-100">
              <Wallet className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700">
                {currentCycle.name}: {"\u20AA"}{stats.total.toFixed(2)}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 rounded-lg border border-zinc-200">
              <Calendar className="w-4 h-4 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-600">
                No active billing cycle
              </span>
            </div>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
                <Filter className="w-4 h-4" />
                {getFilterLabel()}
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {currentCycle && (
                <DropdownMenuItem onClick={() => handleFilterChange("cycle", currentCycle.id)}>
                  <div className="flex items-center gap-2 w-full">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="flex-1">{currentCycle.name}</span>
                    <span className="text-xs text-blue-600">Current</span>
                  </div>
                </DropdownMenuItem>
              )}
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
              
              {cycles.filter(c => c.id !== currentCycle?.id).length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <p className="px-2 py-1.5 text-xs text-zinc-500 font-medium">Past Cycles</p>
                  {cycles.filter(c => c.id !== currentCycle?.id).slice(0, 5).map(cycle => (
                    <DropdownMenuItem 
                      key={cycle.id}
                      onClick={() => handleFilterChange("cycle", cycle.id)}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span className="w-2 h-2 rounded-full bg-zinc-300" />
                        <span className="flex-1">{cycle.name}</span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-5 rounded-xl bg-white border border-zinc-200">
            <p className="text-sm text-zinc-500 mb-1">Total Spent</p>
            <p className="text-2xl font-semibold text-zinc-900 tabular-nums">{"\u20AA"}{stats.total.toLocaleString('en-IL', { minimumFractionDigits: 2 })}</p>
            <p className="text-xs text-zinc-400 mt-1">{stats.count} transactions</p>
          </div>
          <button
            onClick={() => router.push("/member/profile#payment-card")}
            className="p-5 rounded-xl bg-blue-600 text-white text-left hover:bg-blue-700 transition-colors"
          >
            <p className="text-sm text-blue-100 mb-1">Card on File</p>
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-200" />
              <span className="font-medium">
                {cardLast4 ? `**** ${cardLast4}` : (member.card_number ? "**** ****" : "Not on file")}
              </span>
            </div>
            <p className="text-xs text-blue-200 mt-2">Tap to update</p>
          </button>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setShowPinDialog(true)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-zinc-200 rounded-xl text-sm font-medium text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 transition-all"
          >
            <KeyRound className="w-4 h-4 text-zinc-500" />
            Change Kiosk PIN
          </button>
          <button
            onClick={() => router.push("/member/profile#payment-card")}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-blue-200 rounded-xl text-sm font-medium text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all"
          >
            <CreditCard className="w-4 h-4" />
            Update Card
          </button>
        </div>

        {/* My Disputes */}
        {myDisputes.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
              My Disputes
            </p>
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="divide-y divide-zinc-100">
                {myDisputes.map((dispute) => (
                  <div key={dispute.id} className="px-5 py-3.5">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">
                          {dispute.transactions?.businesses?.name || "Unknown Business"}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {"\u20AA"}{Number(dispute.transactions?.amount || 0).toFixed(2)} - {dispute.transactions?.description || "No description"}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        dispute.status === "pending" 
                          ? "bg-amber-100 text-amber-700" 
                          : dispute.status === "resolved"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                      }`}>
                        {dispute.status === "pending" ? "Pending Review" : 
                         dispute.status === "resolved" ? "Resolved" : "Rejected"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 mb-1">
                      <span className="font-medium">Your reason:</span> {dispute.reason}
                    </p>
                    {dispute.admin_notes && (
                      <p className="text-xs text-zinc-600">
                        <span className="font-medium">Admin response:</span> {dispute.admin_notes}
                      </p>
                    )}
                    <p className="text-xs text-zinc-400 mt-2">
                      Submitted {new Date(dispute.created_at).toLocaleDateString('en-IL', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Jerusalem' })} (Israel)
                      {dispute.resolved_at && ` - Resolved ${new Date(dispute.resolved_at).toLocaleDateString('en-IL', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Jerusalem' })}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Transactions */}
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
          {getFilterLabel()} Transactions
        </p>
        
        {transactions.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200 py-12">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mx-auto mb-3">
                <Receipt className="w-6 h-6 text-zinc-400" />
              </div>
              <p className="text-zinc-500 text-sm">No transactions found</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="divide-y divide-zinc-100">
              {transactions.map((tx) => (
                <div key={tx.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-zinc-50 transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center">
                      <Receipt className="w-4 h-4 text-zinc-500" />
                    </div>
                    <div>
<p className="text-sm font-medium text-zinc-900">{tx.business?.name || "Unknown"}</p>
                  <p className="text-xs text-zinc-500">
                    {new Date(tx.created_at).toLocaleDateString('en-IL', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Jerusalem' })} IL
                  </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-zinc-900 tabular-nums">{"\u20AA"}{Number(tx.amount).toFixed(2)}</p>
                    <button
                      onClick={() => {
                        setDisputeTransaction(tx);
                        setShowDisputeDialog(true);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-all"
                      title="Report issue"
                    >
                      <Flag className="w-3 h-3" />
                      <span>Dispute</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* PIN Change Dialog */}
      <Dialog open={showPinDialog} onOpenChange={(open) => {
        setShowPinDialog(open);
        if (!open) {
          setNewPin("");
          setConfirmPin("");
          setPinError("");
          setPinSuccess(false);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Change Kiosk PIN
            </DialogTitle>
            <DialogDescription>
              Enter a new 4-digit PIN for kiosk purchases
            </DialogDescription>
          </DialogHeader>
          
          {pinSuccess ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <p className="font-medium text-green-800">PIN Updated Successfully</p>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium text-zinc-700">New PIN</label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    className="mt-1 text-center text-lg tracking-widest"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-700">Confirm PIN</label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    className="mt-1 text-center text-lg tracking-widest"
                  />
                </div>
                {pinError && (
                  <p className="text-sm text-red-600">{pinError}</p>
                )}
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowPinDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handlePinChange} disabled={savingPin || newPin.length !== 4}>
                  {savingPin && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Save PIN
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dispute Dialog */}
      <Dialog open={showDisputeDialog} onOpenChange={(open) => {
        setShowDisputeDialog(open);
        if (!open) {
          setDisputeTransaction(null);
          setDisputeReason("");
          setDisputeSuccess(false);
          setDisputeError("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="w-5 h-5 text-red-500" />
              Report Transaction Issue
            </DialogTitle>
            <DialogDescription>
              Submit this transaction for review by an administrator
            </DialogDescription>
          </DialogHeader>
          
          {disputeSuccess ? (
            <div className="py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <p className="font-medium text-green-800">Report Submitted</p>
              <p className="text-sm text-zinc-500 mt-1">An admin will review your request</p>
            </div>
          ) : disputeTransaction && (
            <>
              <div className="py-4">
                <div className="bg-zinc-50 rounded-lg p-3 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-zinc-900">
                      {disputeTransaction.business?.name}
                    </span>
                    <span className="font-semibold">{"\u20AA"}{Number(disputeTransaction.amount).toFixed(2)}</span>
                  </div>
<p className="text-xs text-zinc-500 mt-1">
                        {new Date(disputeTransaction.created_at).toLocaleDateString("en-IL", {
                          day: "numeric",
                          month: "short",
                          timeZone: "Asia/Jerusalem",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit"
                    })}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-zinc-700">Reason for dispute</label>
                  <Textarea
                    placeholder="Please describe the issue with this transaction..."
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    className="mt-1"
                    rows={3}
                  />
                </div>
              </div>
              
              {disputeError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">{disputeError}</p>
                </div>
              )}
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDisputeDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSubmitDispute} 
                  disabled={submittingDispute || !disputeReason.trim()}
                  variant="destructive"
                >
                  {submittingDispute && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Submit for Review
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Card Update Dialog */}
      <Dialog open={showCardUpdateDialog} onOpenChange={setShowCardUpdateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Update Payment Method
            </DialogTitle>
            <DialogDescription>
              Enter your credit card details
            </DialogDescription>
          </DialogHeader>

          {cardSuccess ? (
            <div className="py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <p className="font-medium text-green-900">Card submitted for review</p>
              <p className="text-sm text-green-700 mt-2">Our team will verify your card and update your account shortly.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-700">Card Number</label>
                <Input
                  placeholder="1234 5678 9012 3456"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                  className="mt-1"
                  disabled={submittingCard}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-zinc-700">Month</label>
                  <Input
                    placeholder="MM"
                    value={cardExpMonth}
                    onChange={(e) => setCardExpMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    className="mt-1"
                    disabled={submittingCard}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-700">Year</label>
                  <Input
                    placeholder="YY"
                    value={cardExpYear}
                    onChange={(e) => setCardExpYear(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    className="mt-1"
                    disabled={submittingCard}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-zinc-700">CVC</label>
                  <Input
                    placeholder="123"
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="mt-1"
                    disabled={submittingCard}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-700">ZIP Code</label>
                <Input
                  placeholder="12345"
                  value={cardZip}
                  onChange={(e) => setCardZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  className="mt-1"
                  disabled={submittingCard}
                />
              </div>

              {cardError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-700">{cardError}</p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCardUpdateDialog(false)} disabled={submittingCard}>
                  Cancel
                </Button>
                <Button 
                  onClick={async () => {
                    console.log("[v0] Submit Card button clicked");
                    setCardError("");
                    if (!cardNumber || !cardExpMonth || !cardExpYear || !cardCvc) {
                      console.log("[v0] Missing required fields");
                      setCardError("Please fill in all required fields");
                      return;
                    }
                    console.log("[v0] Submitting card for member:", member?.id);
                    setSubmittingCard(true);
                    const result = await submitNewCard({
                      memberId: member!.id,
                      cardNumber,
                      cardCvc,
                      cardExpMonth,
                      cardExpYear,
                      cardZip,
                    });
                    console.log("[v0] submitNewCard result:", result);
                    if (result.success) {
                      setCardSuccess(true);
                      setTimeout(() => {
                        setShowCardUpdateDialog(false);
                        setCardSuccess(false);
                        setCardNumber("");
                        setCardExpMonth("");
                        setCardExpYear("");
                        setCardCvc("");
                        setCardZip("");
                      }, 2000);
                    } else {
                      setCardError(result.error || "Failed to submit card");
                    }
                    setSubmittingCard(false);
                  }}
                  disabled={submittingCard}
                >
                  {submittingCard && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                  Submit Card
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
