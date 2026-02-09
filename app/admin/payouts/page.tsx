"use client";

import { Input } from "@/components/ui/input"

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { Download, Wallet, TrendingUp, Receipt, ChevronRight } from "lucide-react";
import type { Business } from "@/lib/types";

interface BillingCycle {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
}

interface PayoutData {
  business: Business;
  grossRevenue: number;
  feeAmount: number;
  netPayout: number;
  transactionCount: number;
}

interface TransactionDetail {
  id: string;
  amount: number;
  created_at: string;
  member: {
    first_name: string;
    last_name: string;
  } | null;
  items: { name: string; quantity: number; price: number }[] | null;
}

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<PayoutData[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [selectedBusiness, setSelectedBusiness] = useState<PayoutData | null>(null);
  const [transactions, setTransactions] = useState<TransactionDetail[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Load cycles on mount
  useEffect(() => {
    async function loadCycles() {
      const supabase = createClient();
      const { data: cyclesData } = await supabase
        .from("billing_cycles")
        .select("*")
        .order("created_at", { ascending: false });
      
      setCycles(cyclesData || []);
      
      // Default to last closed cycle
      const closedCycle = cyclesData?.find(c => c.status === "closed");
      if (closedCycle) {
        setSelectedCycleId(closedCycle.id);
      } else if (cyclesData && cyclesData.length > 0) {
        setSelectedCycleId(cyclesData[0].id);
      }
    }
    loadCycles();
  }, []);

  // Load payouts when cycle changes
  useEffect(() => {
    if (selectedCycleId) {
      loadPayouts();
    }
  }, [selectedCycleId]);

  async function loadPayouts() {
    if (!selectedCycleId) return;
    
    setLoading(true);
    const supabase = createClient();

    // Get all active businesses
    const { data: businesses } = await supabase
      .from("businesses")
      .select("*")
      .is("deleted_at", null)
      .order("name");

    if (!businesses) {
      setPayouts([]);
      setLoading(false);
      return;
    }

    // Get transactions for each business using billing_cycle_id
    const payoutData: PayoutData[] = [];

    for (const business of businesses) {
      const { data: transactions } = await supabase
        .from("transactions")
        .select("amount")
        .eq("business_id", business.id)
        .eq("billing_cycle_id", selectedCycleId);

      const grossRevenue = transactions?.reduce((sum, tx) => sum + Number(tx.amount), 0) || 0;
      const feePercentage = Number(business.fee_percentage) || 0;
      const feeAmount = grossRevenue * (feePercentage / 100);
      const netPayout = grossRevenue - feeAmount;

      payoutData.push({
        business,
        grossRevenue,
        feeAmount,
        netPayout,
        transactionCount: transactions?.length || 0,
      });
    }

    // Sort by net payout descending
    payoutData.sort((a, b) => b.netPayout - a.netPayout);

    setPayouts(payoutData);
    setLoading(false);
  }

  const totalGross = payouts.reduce((sum, p) => sum + p.grossRevenue, 0);
  const totalFees = payouts.reduce((sum, p) => sum + p.feeAmount, 0);
  const totalPayouts = payouts.reduce((sum, p) => sum + p.netPayout, 0);

  async function loadTransactions(payout: PayoutData) {
    setSelectedBusiness(payout);
    setLoadingTransactions(true);
    const supabase = createClient();

    if (!selectedCycleId) {
      setLoadingTransactions(false);
      return;
    }

    const { data } = await supabase
      .from("transactions")
      .select(`
        id,
        amount,
        created_at,
        items,
        members(first_name, last_name)
      `)
      .eq("business_id", payout.business.id)
      .eq("billing_cycle_id", selectedCycleId)
      .order("created_at", { ascending: false });

    // Map the data to match our interface
    const mappedData = data?.map(tx => ({
      ...tx,
      member: tx.members
    })) || [];
    
    setTransactions(mappedData as TransactionDetail[]);
    setLoadingTransactions(false);
  }

  function exportToExcel() {
    const selectedCycle = cycles.find(c => c.id === selectedCycleId);
    
    // Create CSV content
    const headers = [
      "Business Name",
      "Gross Revenue (₪)",
      "Fee %",
      "Fee Amount (₪)",
      "Net Payout (₪)",
      "Transaction Count",
    ];

    const rows = payouts.map((p) => [
      p.business.name,
      p.grossRevenue.toFixed(2),
      Number(p.business.fee_percentage).toFixed(1),
      p.feeAmount.toFixed(2),
      p.netPayout.toFixed(2),
      p.transactionCount,
    ]);

    // Add totals row
    rows.push([
      "TOTAL",
      totalGross.toFixed(2),
      "",
      totalFees.toFixed(2),
      totalPayouts.toFixed(2),
      payouts.reduce((sum, p) => sum + p.transactionCount, 0),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    // Download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `payouts-${selectedCycle?.name.replace(/\s+/g, "-").toLowerCase() || "export"}-${new Date().toISOString().slice(0, 10)}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const selectedCycle = cycles.find(c => c.id === selectedCycleId);
  const cycleLabel = selectedCycle?.name || "Select Cycle";

  // Filter payouts by search
  const filteredPayouts = payouts.filter(p => 
    !searchQuery || p.business.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payouts</h1>
          <p className="text-muted-foreground mt-1">
            Business earnings breakdown after fees
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Input
            placeholder="Search businesses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48"
          />
          <Select value={selectedCycleId} onValueChange={setSelectedCycleId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select cycle" />
            </SelectTrigger>
            <SelectContent>
              {cycles.map(cycle => (
                <SelectItem key={cycle.id} value={cycle.id}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      cycle.status === "active" ? "bg-green-500" : 
                      cycle.status === "closed" ? "bg-amber-500" : "bg-muted"
                    }`} />
                    {cycle.name}
                    {cycle.status === "active" && " (Current)"}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={exportToExcel} disabled={payouts.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export to Excel
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-xl">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Gross Revenue ({cycleLabel})
                </p>
                <p className="text-2xl font-bold text-foreground">
                  ₪{totalGross.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="bg-green-50 p-3 rounded-xl">
                <Receipt className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Your Fees Earned</p>
                <p className="text-2xl font-bold text-green-600">
                  ₪{totalFees.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="bg-orange-50 p-3 rounded-xl">
                <Wallet className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total to Pay Out</p>
                <p className="text-2xl font-bold text-orange-600">
                  ₪{totalPayouts.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payouts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payout Breakdown by Business</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredPayouts.length > 0 ? (
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Gross Revenue</TableHead>
                    <TableHead className="text-right">Fee %</TableHead>
                    <TableHead className="text-right">Fee Amount</TableHead>
                    <TableHead className="text-right">Net Payout</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPayouts.map((payout) => (
                    <TableRow 
                      key={payout.business.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => loadTransactions(payout)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {payout.business.name}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {payout.transactionCount}
                      </TableCell>
                      <TableCell className="text-right">
                        ₪{payout.grossRevenue.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {Number(payout.business.fee_percentage).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        ₪{payout.feeAmount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ₪{payout.netPayout.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals Row */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell className="text-right">
                      {payouts.reduce((sum, p) => sum + p.transactionCount, 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      ₪{totalGross.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right text-green-600">
                      ₪{totalFees.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      ₪{totalPayouts.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-12">
              No transactions found for this period
            </p>
          )}
        </CardContent>
      </Card>

      {/* Transaction Detail Dialog */}
      <Dialog open={!!selectedBusiness} onOpenChange={(open) => !open && setSelectedBusiness(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{selectedBusiness?.business.name} - Transactions ({cycleLabel})</span>
            </DialogTitle>
          </DialogHeader>
          
          {selectedBusiness && (
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-xs text-muted-foreground">Gross Revenue</p>
                <p className="text-lg font-semibold">₪{selectedBusiness.grossRevenue.toFixed(2)}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-xs text-green-600">Fee ({Number(selectedBusiness.business.fee_percentage).toFixed(1)}%)</p>
                <p className="text-lg font-semibold text-green-600">₪{selectedBusiness.feeAmount.toFixed(2)}</p>
              </div>
              <div className="bg-orange-50 p-3 rounded-lg">
                <p className="text-xs text-orange-600">Net Payout</p>
                <p className="text-lg font-semibold text-orange-600">₪{selectedBusiness.netPayout.toFixed(2)}</p>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-auto border border-border rounded-lg">
            {loadingTransactions ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : transactions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm">
                        {new Date(tx.created_at).toLocaleDateString()}{" "}
                        <span className="text-muted-foreground">
                          {new Date(tx.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </TableCell>
                      <TableCell>
                        {tx.member ? `${tx.member.first_name} ${tx.member.last_name}` : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {tx.items?.map((item) => `${item.quantity}x ${item.name}`).join(", ") || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₪{Number(tx.amount).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-12">
                No transactions found
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
