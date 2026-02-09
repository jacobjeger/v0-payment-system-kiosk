"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2, Loader2, RotateCcw, MoreHorizontal, Download, Plus } from "lucide-react";
import { bulkDeleteTransactions, voidTransaction, createManualTransaction } from "@/app/actions/admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TransactionBulkUpload } from "./transaction-bulk-upload";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Transaction {
  id: string;
  amount: number;
  balance_before: number;
  balance_after: number;
  description: string | null;
  created_at: string;
  billing_cycle_id: string | null;
  members: { id: string; first_name: string; last_name: string; member_code: string } | null;
  businesses: { id: string; name: string } | null;
}

interface BillingCycle {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string | null;
}

interface TransactionListProps {
  transactions: Transaction[];
  businesses: { id: string; name: string }[];
  billingCycles: BillingCycle[];
  activeCycleId: string | null;
  members: { id: string; first_name: string; last_name: string; member_code: string }[];
}

export function TransactionList({ transactions, businesses, billingCycles, activeCycleId, members }: TransactionListProps) {
  const [search, setSearch] = useState("");
  const [businessFilter, setBusinessFilter] = useState<string>("all");
  const [cycleFilter, setCycleFilter] = useState<string>(activeCycleId || "all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidingTx, setVoidingTx] = useState<Transaction | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  // Add transaction state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addMemberId, setAddMemberId] = useState("");
  const [addBusinessId, setAddBusinessId] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addDescription, setAddDescription] = useState("");
  const [addDate, setAddDate] = useState("");
  const [addTime, setAddTime] = useState("");
  const [addMemberSearch, setAddMemberSearch] = useState("");
  const [submittingAdd, setSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState("");

  const filteredMembers = members.filter((m) => {
    if (!addMemberSearch) return true;
    const search = addMemberSearch.toLowerCase();
    return (
      m.first_name.toLowerCase().includes(search) ||
      m.last_name.toLowerCase().includes(search) ||
      m.member_code.toLowerCase().includes(search)
    );
  });

  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch =
      !search ||
      tx.members?.first_name.toLowerCase().includes(search.toLowerCase()) ||
      tx.members?.last_name.toLowerCase().includes(search.toLowerCase()) ||
      tx.members?.member_code.toLowerCase().includes(search.toLowerCase()) ||
      tx.description?.toLowerCase().includes(search.toLowerCase());

    const matchesBusiness =
      businessFilter === "all" || tx.businesses?.id === businessFilter;

    const matchesCycle =
      cycleFilter === "all" || tx.billing_cycle_id === cycleFilter;

    return matchesSearch && matchesBusiness && matchesCycle;
  });

  const currentCycleName = cycleFilter === "all" 
    ? "All Cycles" 
    : billingCycles.find(c => c.id === cycleFilter)?.name || "Unknown";

  // Calculate totals
  const totalAmount = filteredTransactions.reduce(
    (sum, tx) => sum + Number(tx.amount),
    0
  );

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredTransactions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTransactions.map(tx => tx.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  async function handleBulkDelete() {
    setDeleting(true);
    const result = await bulkDeleteTransactions(selectedIds);
    if (result.success) {
      setSelectedIds([]);
      setDeleteDialogOpen(false);
      // Refresh page to show updated list
      window.location.reload();
    }
    setDeleting(false);
  }

  async function handleVoidTransaction() {
    if (!voidingTx || !voidReason.trim()) return;
    setVoiding(true);
    const result = await voidTransaction(voidingTx.id, voidReason.trim());
    if (result.success) {
      setVoidDialogOpen(false);
      setVoidingTx(null);
      setVoidReason("");
      window.location.reload();
    }
    setVoiding(false);
  }

  function openVoidDialog(tx: Transaction) {
    setVoidingTx(tx);
    setVoidReason("");
    setVoidDialogOpen(true);
  }

  function exportToCSV() {
    const headers = [
      "Date",
      "Time",
      "Member Code",
      "Member Name",
      "Business",
      "Description",
      "Amount",
      "Balance Before",
      "Balance After",
      "Billing Cycle",
    ];
    
    const rows = filteredTransactions.map((tx) => {
      const date = new Date(tx.created_at);
      return [
        date.toLocaleDateString("en-GB"),
        date.toLocaleTimeString("en-GB", { hour12: false }),
        tx.members?.member_code || "",
        tx.members ? `${tx.members.first_name} ${tx.members.last_name}` : "",
        tx.businesses?.name || "",
        (tx.description || "").replace(/,/g, ";"),
        tx.amount.toFixed(2),
        tx.balance_before.toFixed(2),
        tx.balance_after.toFixed(2),
        billingCycles.find(c => c.id === tx.billing_cycle_id)?.name || "",
      ];
    });
    
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    
    const fileName = `transactions-${currentCycleName.replace(/\s+/g, "-").toLowerCase()}-${
      businessFilter !== "all" 
        ? businesses.find(b => b.id === businessFilter)?.name.replace(/\s+/g, "-").toLowerCase() + "-"
        : ""
    }${new Date().toISOString().split("T")[0]}.csv`;
    
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Input
          placeholder="Search by member or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <Select value={cycleFilter} onValueChange={setCycleFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select billing cycle" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Billing Cycles</SelectItem>
            {billingCycles.map((cycle) => (
              <SelectItem key={cycle.id} value={cycle.id}>
                {cycle.name} {cycle.status === "active" && "(Current)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={businessFilter} onValueChange={setBusinessFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All businesses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Businesses</SelectItem>
            {businesses.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToCSV}
            disabled={filteredTransactions.length === 0}
            className="bg-transparent"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <TransactionBulkUpload 
            cycleId={cycleFilter !== "all" ? cycleFilter : undefined}
            onSuccess={() => window.location.reload()}
          />
          <Button
            size="sm"
            onClick={() => {
              setAddMemberId("");
              setAddBusinessId("");
              setAddAmount("");
              setAddDescription("");
              setAddDate("");
              setAddTime("");
              setAddMemberSearch("");
              setAddError("");
              setAddDialogOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Transaction
          </Button>
        </div>
      </div>

      {/* Summary & Bulk Actions */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={selectedIds.length === filteredTransactions.length && filteredTransactions.length > 0}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm text-muted-foreground">
                {selectedIds.length > 0 ? `${selectedIds.length} selected` : "Select all"}
              </span>
            </div>
            {selectedIds.length > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete Selected
              </Button>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div>
              <p className="text-sm text-muted-foreground">
                {currentCycleName}
              </p>
              <p className="text-lg font-semibold text-foreground">
                {filteredTransactions.length} transactions
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Amount</p>
              <p className="text-lg font-bold text-primary">
                ₪{totalAmount.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selectedIds.length === filteredTransactions.length && filteredTransactions.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Date & Time</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance After</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransactions.map((tx) => (
              <TableRow key={tx.id} className={selectedIds.includes(tx.id) ? "bg-muted/50" : ""}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(tx.id)}
                    onCheckedChange={() => toggleSelect(tx.id)}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(tx.created_at).toLocaleString()}
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium text-foreground">
                      {tx.members?.first_name} {tx.members?.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {tx.members?.member_code}
                    </p>
                  </div>
                </TableCell>
                <TableCell>{tx.businesses?.name || "-"}</TableCell>
                <TableCell className="text-muted-foreground max-w-xs truncate">
                  {tx.description || "-"}
                </TableCell>
                <TableCell className="text-right font-semibold text-foreground">
                  ₪{Number(tx.amount).toFixed(2)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  ₪{Number(tx.balance_after).toFixed(2)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        onClick={() => openVoidDialog(tx)}
                        className="text-amber-600"
                      >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Void Transaction
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredTransactions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {search || businessFilter !== "all"
              ? "No transactions found matching your filters"
              : "No transactions yet"}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transactions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedIds.length} transaction{selectedIds.length !== 1 ? "s" : ""}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Transaction Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
            <DialogDescription>
              Manually add a transaction. You can postdate by setting a custom date and time.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Member */}
            <div className="space-y-2">
              <Label>Member</Label>
              <Select value={addMemberId} onValueChange={setAddMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 pb-2">
                    <Input
                      placeholder="Search members..."
                      value={addMemberSearch}
                      onChange={(e) => setAddMemberSearch(e.target.value)}
                      className="h-8"
                    />
                  </div>
                  {filteredMembers.slice(0, 50).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.first_name} {m.last_name} ({m.member_code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Business */}
            <div className="space-y-2">
              <Label>Business</Label>
              <Select value={addBusinessId} onValueChange={setAddBusinessId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select business" />
                </SelectTrigger>
                <SelectContent>
                  {businesses.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={addAmount}
                onChange={(e) => setAddAmount(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                placeholder="e.g. Lunch purchase"
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
              />
            </div>

            {/* Date & Time (postdate) */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date (optional)</Label>
                <Input
                  type="date"
                  value={addDate}
                  onChange={(e) => setAddDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Time (optional)</Label>
                <Input
                  type="time"
                  value={addTime}
                  onChange={(e) => setAddTime(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Leave date and time blank to use the current date and time.</p>

            {addError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-700">{addError}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={submittingAdd}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setAddError("");
                if (!addMemberId) { setAddError("Please select a member"); return; }
                if (!addBusinessId) { setAddError("Please select a business"); return; }
                if (!addAmount || isNaN(Number(addAmount)) || Number(addAmount) <= 0) { setAddError("Please enter a valid amount"); return; }

                let transactionDate: string | undefined;
                if (addDate) {
                  const time = addTime || "12:00";
                  transactionDate = new Date(`${addDate}T${time}`).toISOString();
                }

                setSubmittingAdd(true);
                const result = await createManualTransaction({
                  memberId: addMemberId,
                  businessId: addBusinessId,
                  amount: Number(addAmount),
                  description: addDescription || "Manual transaction",
                  transactionDate,
                });

                if (result.success) {
                  setAddDialogOpen(false);
                  window.location.reload();
                } else {
                  setAddError(result.error || "Failed to create transaction");
                }
                setSubmittingAdd(false);
              }}
              disabled={submittingAdd}
            >
              {submittingAdd && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Add Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void Transaction Dialog */}
      <AlertDialog open={voidDialogOpen} onOpenChange={setVoidDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-500" />
              Void Transaction
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  This will create a reversal entry and adjust the member&apos;s balance by 
                  <span className="font-semibold text-foreground"> -₪{voidingTx ? Number(voidingTx.amount).toFixed(2) : "0.00"}</span>.
                </p>
                {voidingTx && (
                  <div className="bg-muted rounded-lg p-3 text-sm">
                    <p><span className="text-muted-foreground">Member:</span> {voidingTx.members?.first_name} {voidingTx.members?.last_name}</p>
                    <p><span className="text-muted-foreground">Business:</span> {voidingTx.businesses?.name}</p>
                    <p><span className="text-muted-foreground">Original Amount:</span> ₪{Number(voidingTx.amount).toFixed(2)}</p>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="void-reason">Reason for voiding (required)</Label>
                  <Textarea
                    id="void-reason"
                    value={voidReason}
                    onChange={(e) => setVoidReason(e.target.value)}
                    placeholder="Enter reason for voiding this transaction..."
                    rows={2}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={voiding}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVoidTransaction}
              disabled={voiding || !voidReason.trim()}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {voiding ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Voiding...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Void Transaction
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
