"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Search, Download, AlertTriangle, CheckCircle, Filter, Calendar, ChevronDown } from "lucide-react";
import { submitTransactionDispute, getBusinessDisputes } from "@/app/actions/business";
import { AddTransactionDialog } from "@/components/business/add-transaction-dialog";

interface Transaction {
  id: string;
  amount: number;
  description: string;
  created_at: string;
  member: {
    first_name: string;
    last_name: string;
  };
  review_status?: string;
}

interface BillingCycle {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
}

type FilterType = "cycle" | "1m" | "3m" | "6m" | "1y" | "all";

export default function BusinessTransactionsPage() {
  const router = useRouter();
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [business, setBusiness] = useState<{ id: string; can_add_transactions?: boolean } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reviewDialog, setReviewDialog] = useState<Transaction | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewedTransactions, setReviewedTransactions] = useState<Set<string>>(new Set());
  const [myDisputes, setMyDisputes] = useState<Array<{
    id: string;
    reason: string;
    status: string;
    admin_notes: string | null;
    created_at: string;
    resolved_at: string | null;
    submitted_by: string | null;
    member_id: string | null;
    transactions: {
      id: string;
      amount: number;
      description: string;
      created_at: string;
      members: { first_name: string; last_name: string } | null;
    } | null;
  }>>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (businessId) {
      loadCycles();
    }
  }, [businessId]);

  useEffect(() => {
    if (businessId && cycles.length >= 0) {
      loadTransactions();
      loadDisputes();
    }
  }, [businessId, filterType, selectedCycleId, cycles]);

  async function checkAuth() {
    const supabase = createClient();
    const pinBusinessId = sessionStorage.getItem("business_id") || localStorage.getItem("business_id");
    
    if (pinBusinessId) {
      setBusinessId(pinBusinessId);
      // Load business data to check permissions
      const { data: businessData } = await supabase
        .from("businesses")
        .select("id, can_add_transactions")
        .eq("id", pinBusinessId)
        .single();
      if (businessData) {
        setBusiness(businessData);
      }
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/business/login");
        return;
      }
      const { data } = await supabase
        .from("businesses")
        .select("id, can_add_transactions")
        .eq("auth_user_id", user.id)
        .single();
      
      if (data) {
        setBusinessId(data.id);
        setBusiness(data);
      } else {
        router.push("/business/login");
      }
    }
  }

  async function loadDisputes() {
    if (!businessId) return;
    
    // Only load disputes for the current cycle filter
    const cycleId = filterType === "cycle" && selectedCycleId ? selectedCycleId : null;
    const disputesResult = await getBusinessDisputes(businessId, cycleId);
    if (disputesResult.success) {
      setMyDisputes(disputesResult.data as typeof myDisputes);
    }
  }

  async function loadCycles() {
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
    }
  }

  async function loadTransactions() {
    if (!businessId) return;
    
    const supabase = createClient();
    let query = supabase
      .from("transactions")
      .select(`
        id,
        amount,
        description,
        created_at,
        member:members(first_name, last_name)
      `)
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    // Apply filter
    if (filterType === "cycle" && selectedCycleId) {
      // Filter by billing_cycle_id for accurate results
      query = query.eq("billing_cycle_id", selectedCycleId);
    } else if (filterType !== "all") {
      const now = new Date();
      let startDate: Date;
      
      switch (filterType) {
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

    const { data } = await query;
    setTransactions((data as unknown as Transaction[]) || []);
    
    // Load which transactions have been submitted for review
    const { data: reviews } = await supabase
      .from("transaction_reviews")
      .select("transaction_id")
      .eq("business_id", businessId);
    
    if (reviews) {
      setReviewedTransactions(new Set(reviews.map(r => r.transaction_id)));
    }
    
    setLoading(false);
  }

  function handleFilterChange(filter: FilterType, cycleId?: string) {
    setFilterType(filter);
    setSelectedCycleId(cycleId || null);
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

  async function submitForReview() {
    if (!reviewDialog || !reviewReason.trim() || !businessId) return;
    
    setSubmittingReview(true);
    
    const result = await submitTransactionDispute({
      transactionId: reviewDialog.id,
      businessId: businessId,
      reason: reviewReason.trim(),
    });
    
    if (result.success) {
      setReviewedTransactions(prev => new Set([...prev, reviewDialog.id]));
      setReviewDialog(null);
      setReviewReason("");
    } else {
      alert("Failed to submit review: " + result.error);
    }
    
    setSubmittingReview(false);
  }

  const filteredTransactions = transactions.filter((tx) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      tx.member.first_name.toLowerCase().includes(searchLower) ||
      tx.member.last_name.toLowerCase().includes(searchLower) ||
      tx.description?.toLowerCase().includes(searchLower)
    );
  });

  const totalAmount = filteredTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);

  function exportCSV() {
    const headers = ["Date", "Time", "Member", "Description", "Amount"];
    const rows = filteredTransactions.map((tx) => [
      new Date(tx.created_at).toLocaleDateString(),
      new Date(tx.created_at).toLocaleTimeString(),
      `${tx.member.first_name} ${tx.member.last_name}`,
      tx.description || "",
      tx.amount.toFixed(2),
    ]);
    
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${getFilterLabel().replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/business/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Transactions</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Add Transaction Button (if enabled) */}
        {business?.can_add_transactions && (
          <div className="mb-6">
            <AddTransactionDialog 
              businessId={business.id} 
              onSuccess={() => {
                loadTransactions();
                loadDisputes();
              }}
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Cycle/Time Filter Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="min-w-[160px] justify-between bg-transparent">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  {getFilterLabel()}
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
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
                  <p className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Billing Cycles</p>
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

          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Summary */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-muted-foreground">
                  {filteredTransactions.length} transactions
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-2xl font-bold">{"\u20AA"}{totalAmount.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* My Disputes - Only show disputes submitted by this business */}
        {myDisputes.filter(d => d.submitted_by === "business").length > 0 && (
          <Card className="mb-6">
            <CardContent className="py-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
                My Disputes
              </h3>
              <div className="divide-y">
                {myDisputes.filter(d => d.submitted_by === "business").map((dispute) => (
                  <div key={dispute.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium">
                          {dispute.transactions?.members 
                            ? `${dispute.transactions.members.first_name} ${dispute.transactions.members.last_name}`
                            : "Unknown Member"}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground mb-1">
                      <span className="font-medium">Your reason:</span> {dispute.reason}
                    </p>
                    {dispute.admin_notes && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Admin response:</span> {dispute.admin_notes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      Submitted {new Date(dispute.created_at).toLocaleDateString("en-IL", { timeZone: "Asia/Jerusalem" })} (Israel)
                      {dispute.resolved_at && ` - Resolved ${new Date(dispute.resolved_at).toLocaleDateString("en-IL", { timeZone: "Asia/Jerusalem" })}`}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Member Disputes - Show disputes submitted by members about this business's transactions */}
        {myDisputes.filter(d => d.submitted_by === "member").length > 0 && (
          <Card className="mb-6 border-amber-200">
            <CardContent className="py-4">
              <h3 className="text-sm font-medium text-amber-700 uppercase tracking-wider mb-4">
                Member Disputes (Submitted by Customers)
              </h3>
              <div className="divide-y">
                {myDisputes.filter(d => d.submitted_by === "member").map((dispute) => (
                  <div key={dispute.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium">
                          {dispute.transactions?.members 
                            ? `${dispute.transactions.members.first_name} ${dispute.transactions.members.last_name}`
                            : "Unknown Member"}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
                    <p className="text-xs text-muted-foreground mb-1">
                      <span className="font-medium">Customer reason:</span> {dispute.reason}
                    </p>
                    {dispute.admin_notes && (
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Admin response:</span> {dispute.admin_notes}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground/70 mt-2">
                      Submitted {new Date(dispute.created_at).toLocaleDateString("en-IL", { timeZone: "Asia/Jerusalem" })} (Israel)
                      {dispute.resolved_at && ` - Resolved ${new Date(dispute.resolved_at).toLocaleDateString("en-IL", { timeZone: "Asia/Jerusalem" })}`}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Transactions Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date (Israel)</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {new Date(tx.created_at).toLocaleDateString("en-IL", { timeZone: "Asia/Jerusalem" })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.created_at).toLocaleTimeString("en-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" })} IL
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {tx.member.first_name} {tx.member.last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tx.description || "-"}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {"\u20AA"}{Number(tx.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {reviewedTransactions.has(tx.id) ? (
                        <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                          <CheckCircle className="w-3 h-3" />
                          Under Review
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReviewDialog(tx)}
                          title="Flag for review"
                        >
                          <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Review Submission Dialog */}
        <Dialog open={!!reviewDialog} onOpenChange={(open) => !open && setReviewDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Submit Transaction for Review</DialogTitle>
              <DialogDescription>
                Flag this transaction for admin review. Please explain why this transaction needs attention.
              </DialogDescription>
            </DialogHeader>
            
            {reviewDialog && (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">
                        {reviewDialog.member.first_name} {reviewDialog.member.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(reviewDialog.created_at).toLocaleDateString()} at{" "}
                        {new Date(reviewDialog.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                    <p className="font-bold">{"\u20AA"}{Number(reviewDialog.amount).toFixed(2)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Review</Label>
                  <Textarea
                    id="reason"
                    placeholder="Describe the issue with this transaction (e.g., incorrect amount, wrong customer, duplicate charge, etc.)"
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                    rows={4}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewDialog(null)}>
                Cancel
              </Button>
              <Button 
                onClick={submitForReview} 
                disabled={!reviewReason.trim() || submittingReview}
              >
                {submittingReview ? "Submitting..." : "Submit for Review"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
