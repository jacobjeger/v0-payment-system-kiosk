"use client";

import React from "react"

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Users,
  DollarSign,
  Mail,
  Send,
  Check,
  Clock,
  Eye,
  FileText,
  ChevronRight,
  Loader2,
  Banknote,
  Download,
  CheckCircle,
  CreditCard,
  XCircle,
  MoreHorizontal,
  Undo2,
  AlertTriangle,
  ArrowUpDown,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getBillingCycleWithInvoices,
  closeBillingCycle,
  updateAllInvoiceMessages,
  sendAllInvoices,
  markInvoiceAsPaidCash,
  markAllAsPaidCash,
  getUnpaidInvoicesWithCards,
  getFullCycleExportData,
  getAllTransactionsForCycle,
  bulkUpdatePaymentStatus,
  unmarkInvoicePayment,
} from "@/app/actions/billing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OwnerOffsetsCard } from "@/components/admin/owner-offsets-card";
import type { BillingCycle, Invoice, Member } from "@/lib/types";

interface PaymentDetail {
  amount: number;
  type: string;
  collectedBy: string;
  date: string;
  notes?: string;
}

interface InvoiceWithMember extends Invoice {
  member: Member | null;
  amount_paid?: number;
  amount_owed?: number;
  payment_details?: PaymentDetail[];
}

export default function BillingCycleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [cycle, setCycle] = useState<BillingCycle | null>(null);
  const [invoices, setInvoices] = useState<InvoiceWithMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [sending, setSending] = useState(false);

  // Email draft dialog
  const [showEmailDraft, setShowEmailDraft] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [savingMessage, setSavingMessage] = useState(false);
  
  // Selection for bulk actions
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
  const [markingCash, setMarkingCash] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingFull, setExportingFull] = useState(false);
  const [exportingTransactions, setExportingTransactions] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  
  // Search and Sort
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "amount">("name");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"all" | "unpaid" | "paid_cash" | "paid_zelle" | "card_processed" | "card_declined">("all");

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    const data = await getBillingCycleWithInvoices(id);
    if (data) {
      setCycle(data.cycle);
      setInvoices(data.invoices as InvoiceWithMember[]);
      // Set default email message if any invoice has one
      const existingMessage = data.invoices.find((i) => i.email_message)?.email_message;
      if (existingMessage) {
        setEmailMessage(existingMessage);
      }
    }
    setLoading(false);
  }

  async function handleCloseCycle() {
    if (!cycle) return;
    setClosing(true);
    const result = await closeBillingCycle(cycle.id);
    if (result.success) {
      await loadData();
    }
    setClosing(false);
  }

  async function handleSaveEmailMessage() {
    if (!cycle) return;
    setSavingMessage(true);
    await updateAllInvoiceMessages(cycle.id, emailMessage);
    setSavingMessage(false);
    setShowEmailDraft(false);
  }

  async function handleSendAllInvoices() {
    if (!cycle) return;
    setSending(true);
    const result = await sendAllInvoices(cycle.id);
    if (result.success) {
      alert(`Sent ${result.sent} invoices. ${result.failed} failed.`);
      await loadData();
    }
    setSending(false);
  }

  async function handleMarkSelectedAsCash() {
    if (!cycle || selectedInvoices.length === 0) return;
    setMarkingCash(true);
    const result = await markAllAsPaidCash(cycle.id, selectedInvoices);
    if (result.success) {
      setSelectedInvoices([]);
      await loadData();
    }
    setMarkingCash(false);
  }

  async function handleBulkPaymentStatus(status: "unpaid" | "paid_cash" | "paid_zelle" | "card_processed" | "card_declined") {
    if (!cycle || selectedInvoices.length === 0) return;
    setBulkProcessing(true);
    const result = await bulkUpdatePaymentStatus(cycle.id, selectedInvoices, status);
    if (result.success) {
      setSelectedInvoices([]);
      await loadData();
    }
    setBulkProcessing(false);
  }

  async function handleUnmarkPayment(invoiceId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await unmarkInvoicePayment(invoiceId);
    await loadData();
  }

  async function handleMarkSingleAsCash(invoiceId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await markInvoiceAsPaidCash(invoiceId);
    await loadData();
  }

  async function handleExportUnpaid() {
    if (!cycle) return;
    setExporting(true);
    
    const unpaidData = await getUnpaidInvoicesWithCards(cycle.id);
    
    // Create CSV content with fee columns
    const headers = ["First Name", "Last Name", "Email", "Phone", "Amount", "Card Fee (10%)", "Total to Charge", "Card Number", "CVC", "Exp Month", "Exp Year", "Zip"];
    const rows = unpaidData.map((inv: { 
      total_amount: number; 
      fee_amount: number;
      total_with_fee: number;
      member: { 
        first_name: string; 
        last_name: string; 
        email: string | null; 
        phone: string | null; 
        card_number: string | null; 
        card_cvc: string | null; 
        card_exp_month: string | null; 
        card_exp_year: string | null; 
        card_zip: string | null 
      } | null 
    }) => [
      inv.member?.first_name || "",
      inv.member?.last_name || "",
      inv.member?.email || "",
      inv.member?.phone || "",
      inv.total_amount.toFixed(2),
      inv.fee_amount.toFixed(2),
      inv.total_with_fee.toFixed(2),
      inv.member?.card_number || "",
      inv.member?.card_cvc || "",
      inv.member?.card_exp_month || "",
      inv.member?.card_exp_year || "",
      inv.member?.card_zip || "",
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");
    
    // Download the file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `unpaid-invoices-${cycle.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setExporting(false);
  }

  async function handleExportFullCycle() {
    if (!cycle) return;
    setExportingFull(true);
    
    const data = await getFullCycleExportData(cycle.id);
    if (!data) {
      setExportingFull(false);
      return;
    }
    
    // Build headers: Last Name, First Name, PIN, Total, then each business
    const headers = ["Last Name", "First Name", "PIN", "Total", ...data.businesses.map(b => b.name)];
    
    // Build rows - include all members with transactions
    const rows = data.members
      .filter(member => member.total > 0)
      .map(member => {
        const businessAmounts = data.businesses.map(biz => {
          const amount = member.businessTotals[biz.id];
          return amount > 0 ? amount.toFixed(2) : "";
        });
        
        return [
          member.lastName,
          member.firstName,
          member.pin,
          member.total.toFixed(2),
          ...businessAmounts,
        ];
      });
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");
    
    // Download the file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${cycle.name.replace(/\s+/g, "-").toLowerCase()}-full-export.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
  setExportingFull(false);
  }
  
  async function handleExportAllTransactions() {
    if (!cycle) return;
    setExportingTransactions(true);
    
    const transactions = await getAllTransactionsForCycle(cycle.id);
    
    // Create CSV content
    const headers = ["Date & Time", "Member Code", "Member Name", "Email", "Business", "Description", "Amount", "Balance Before", "Balance After", "Source", "Notes"];
    const rows = transactions.map((txn: any) => {
      const member = txn.member || {};
      const business = txn.business || {};
      return [
        new Date(txn.created_at).toLocaleString(),
        member.member_code || "",
        `${member.first_name || ""} ${member.last_name || ""}`.trim(),
        member.email || "",
        business.name || "",
        txn.description || "",
        txn.amount?.toFixed(2) || "0.00",
        txn.balance_before?.toFixed(2) || "0.00",
        txn.balance_after?.toFixed(2) || "0.00",
        txn.source || "",
        txn.notes || "",
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(",");
    });
    
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${cycle.name.replace(/\s+/g, "-").toLowerCase()}-all-transactions.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setExportingTransactions(false);
  }
  
  function toggleInvoiceSelection(invoiceId: string) {
    setSelectedInvoices(prev => 
      prev.includes(invoiceId)
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  }

  function toggleSelectAll() {
    const unpaidInvoices = invoices.filter(i => i.status !== "paid_cash");
    if (selectedInvoices.length === unpaidInvoices.length) {
      setSelectedInvoices([]);
    } else {
      setSelectedInvoices(unpaidInvoices.map(i => i.id));
    }
  }

  const totalAmount = invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0);
  const totalTransactions = invoices.reduce((sum, inv) => sum + inv.transaction_count, 0);
  
  // Calculate cash and zelle totals from payment details
  const totalCashReceived = invoices.reduce((sum, inv) => {
    if (inv.payment_details && Array.isArray(inv.payment_details) && inv.payment_details.length > 0) {
      const cashPayments = inv.payment_details.filter((p: any) => p.type === "cash");
      return sum + cashPayments.reduce((pSum: number, p: any) => pSum + Number(p.amount || 0), 0);
    }
    return sum;
  }, 0);
  
  const totalZelleReceived = invoices.reduce((sum, inv) => {
    if (inv.payment_details && Array.isArray(inv.payment_details) && inv.payment_details.length > 0) {
      const zellePayments = inv.payment_details.filter((p: any) => p.type === "zelle");
      return sum + zellePayments.reduce((pSum: number, p: any) => pSum + Number(p.amount || 0), 0);
    }
    return sum;
  }, 0);
  
  const pendingCount = invoices.filter((i) => i.status === "pending").length;
  const sentCount = invoices.filter((i) => i.status === "sent").length;
  const deliveredCount = invoices.filter((i) => i.status === "delivered").length;
  const openedCount = invoices.filter((i) => i.status === "opened").length;
  const paidCashCount = invoices.filter((i) => i.status === "paid_cash" || i.payment_status === "paid_cash").length;
  const partialCashCount = invoices.filter((i) => i.status === "partial_cash" || i.payment_status === "partial_cash").length;
  const cardProcessedCount = invoices.filter((i) => i.payment_status === "card_processed").length;
  const cardDeclinedCount = invoices.filter((i) => i.payment_status === "card_declined").length;
  const unpaidCount = invoices.filter((i) => i.payment_status === "unpaid" || (!i.payment_status && i.status !== "paid_cash" && i.status !== "partial_cash")).length;

  // Filter and sort invoices
  const filteredInvoices = invoices
    .filter((invoice) => {
      // Payment status filter
      if (paymentStatusFilter !== "all") {
        if (paymentStatusFilter === "unpaid") {
          const isUnpaid = invoice.payment_status === "unpaid" || 
                          (!invoice.payment_status && invoice.status !== "paid_cash" && invoice.status !== "partial_cash");
          if (!isUnpaid) return false;
        } else if (paymentStatusFilter === "paid_cash") {
          if (invoice.payment_status !== "paid_cash" && invoice.status !== "paid_cash") return false;
        } else if (paymentStatusFilter === "paid_zelle") {
          if (invoice.payment_status !== "paid_zelle") return false;
        } else if (paymentStatusFilter === "card_processed") {
          if (invoice.payment_status !== "card_processed") return false;
        } else if (paymentStatusFilter === "card_declined") {
          if (invoice.payment_status !== "card_declined") return false;
        }
      }
      
      // Search filter
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      const memberName = `${invoice.member?.first_name || ""} ${invoice.member?.last_name || ""}`.toLowerCase();
      const email = invoice.member?.email?.toLowerCase() || "";
      return memberName.includes(query) || email.includes(query);
    })
    .sort((a, b) => {
      if (sortBy === "name") {
        const nameA = `${a.member?.last_name || ""} ${a.member?.first_name || ""}`.toLowerCase();
        const nameB = `${b.member?.last_name || ""} ${b.member?.first_name || ""}`.toLowerCase();
        return nameA.localeCompare(nameB);
      } else {
        // Sort by amount descending
        return Number(b.total_amount) - Number(a.total_amount);
      }
    });

  // Format date without timezone conversion (prevents day shift issues)
  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('T')[0].split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIndex = parseInt(month, 10) - 1;
    return `${monthNames[monthIndex]} ${parseInt(day, 10)}, ${year}`;
  };

  const getStatusBadge = (status: string, paymentStatus?: string, paymentDetails?: PaymentDetail[]) => {
    // Get the most recent payment info for display
    const lastPayment = paymentDetails?.[0];
    const paymentInfo = lastPayment ? (
      <span className="block text-xs text-muted-foreground mt-1">
        by {lastPayment.collectedBy} ({lastPayment.type})
      </span>
    ) : null;
    
    // Payment status takes priority if set
    if (paymentStatus === "card_processed") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
          <CreditCard className="w-3 h-3" /> Card Processed
        </span>
      );
    }
    if (paymentStatus === "card_declined") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">
          <XCircle className="w-3 h-3" /> Card Declined
        </span>
      );
    }
    if (paymentStatus === "paid_cash" || status === "paid_cash") {
      // Check if it's actually a Zelle payment based on payment details
      const isZelle = lastPayment?.type === "zelle";
      return (
        <div>
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${isZelle ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
            {isZelle ? <span className="font-bold text-[10px]">Z</span> : <Banknote className="w-3 h-3" />} 
            {isZelle ? 'Paid Zelle' : 'Paid Cash'}
          </span>
          {paymentInfo}
        </div>
      );
    }
    if (paymentStatus === "paid_zelle") {
      return (
        <div>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-700">
            <span className="font-bold text-[10px]">Z</span> Paid Zelle
          </span>
          {paymentInfo}
        </div>
      );
    }
    if (paymentStatus === "partial_cash" || status === "partial_cash") {
      // Check if it's actually a Zelle payment based on payment details
      const isZelle = lastPayment?.type === "zelle";
      return (
        <div>
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${isZelle ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
            {isZelle ? <span className="font-bold text-[10px]">Z</span> : <Banknote className="w-3 h-3" />} 
            {isZelle ? 'Partial Zelle' : 'Partial Cash'}
          </span>
          {paymentInfo}
        </div>
      );
    }
    
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-muted text-muted-foreground">
            <Clock className="w-3 h-3" /> Pending
          </span>
        );
      case "sent":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
            <Send className="w-3 h-3" /> Sent
          </span>
        );
      case "delivered":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
            <Check className="w-3 h-3" /> Delivered
          </span>
        );
      case "opened":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-700">
            <Eye className="w-3 h-3" /> Opened
          </span>
        );
      case "paid":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-emerald-100 text-emerald-700">
            <Check className="w-3 h-3" /> Paid
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Billing cycle not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push("/admin/billing/cycles")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{cycle.name}</h1>
            <p className="text-muted-foreground">
              {formatDate(cycle.start_date)} - {formatDate(cycle.end_date)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {cycle.status === "active" && (
            <Button onClick={handleCloseCycle} disabled={closing}>
              {closing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Close Cycle & Generate Invoices
            </Button>
          )}
          {cycle.status === "closed" && (
            <>
              <Button variant="outline" onClick={() => setShowEmailDraft(true)}>
                <FileText className="w-4 h-4 mr-2" />
                Edit Email Draft
              </Button>
              <Button onClick={handleSendAllInvoices} disabled={sending || pendingCount === 0}>
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
                Send All Invoices ({pendingCount})
              </Button>
            </>
          )}
          {cycle.status === "invoiced" && (
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
              All Invoices Sent
            </span>
          )}
          {(cycle.status === "closed" || cycle.status === "invoiced") && (
            <>
              {unpaidCount > 0 && (
                <Button 
                  variant="outline" 
                  onClick={handleExportUnpaid}
                  disabled={exporting}
                >
                  {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Export Unpaid ({unpaidCount})
                </Button>
              )}
              <Button 
                variant="outline" 
                onClick={handleExportFullCycle}
                disabled={exportingFull}
              >
                {exportingFull ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                Export Full Cycle
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Members</p>
                <p className="text-2xl font-bold">{invoices.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-2xl font-bold">₪{totalAmount.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Transactions</p>
                <p className="text-2xl font-bold">{totalTransactions}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Mail className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email Status</p>
                <p className="text-sm">
                  <span className="font-medium">{sentCount + deliveredCount + openedCount}</span> sent,{" "}
                  <span className="font-medium">{openedCount}</span> opened
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg">
                <Banknote className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Cash Received</p>
                <p className="text-2xl font-bold">₪{totalCashReceived.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <span className="w-5 h-5 flex items-center justify-center text-purple-600 font-bold text-sm">Z</span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Zelle Received</p>
                <p className="text-2xl font-bold">₪{totalZelleReceived.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Email & Payment Tracking Stats */}
      {(cycle.status === "closed" || cycle.status === "invoiced") && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Email Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-muted" />
                  <span className="text-sm">Pending: <strong>{pendingCount}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm">Sent: <strong>{sentCount}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm">Delivered: <strong>{deliveredCount}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <span className="text-sm">Opened: <strong>{openedCount}</strong></span>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Payment Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-sm">Unpaid: <strong>{unpaidCount}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-sm">Paid Cash: <strong>{paidCashCount}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm">Card Processed: <strong>{cardProcessedCount}</strong></span>
                </div>
                {cardDeclinedCount > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm text-red-600">Card Declined: <strong>{cardDeclinedCount}</strong></span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Owner Balance Offsets - Only show when cycle is active or closed */}
      {cycle.status === "active" || cycle.status === "closed" ? (
        <OwnerOffsetsCard cycleId={cycle.id} onOffsetsUpdated={loadData} />
      ) : null}

      {/* Bulk Actions Toolbar */}
      {(cycle.status === "closed" || cycle.status === "invoiced") && (
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
          <div className="flex items-center gap-3">
            <Checkbox 
              checked={selectedInvoices.length === invoices.filter(i => i.status !== "paid_cash").length && invoices.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span className="text-sm font-medium">
              {selectedInvoices.length > 0 
                ? `${selectedInvoices.length} selected` 
                : "Select invoices"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {bulkProcessing && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleBulkPaymentStatus("paid_cash")}
              disabled={bulkProcessing || selectedInvoices.length === 0}
              className="bg-transparent"
            >
              <Banknote className="w-4 h-4 mr-1.5 text-green-600" />
              Paid Cash
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleBulkPaymentStatus("paid_zelle")}
              disabled={bulkProcessing || selectedInvoices.length === 0}
              className="bg-transparent"
            >
              <span className="w-4 h-4 mr-1.5 text-purple-600 font-bold text-xs">Z</span>
              Paid Zelle
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleBulkPaymentStatus("card_processed")}
              disabled={bulkProcessing || selectedInvoices.length === 0}
              className="bg-transparent"
            >
              <CreditCard className="w-4 h-4 mr-1.5 text-blue-600" />
              Card Processed
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleBulkPaymentStatus("card_declined")}
              disabled={bulkProcessing || selectedInvoices.length === 0}
              className="bg-transparent text-destructive hover:text-destructive"
            >
              <XCircle className="w-4 h-4 mr-1.5" />
              Declined
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleBulkPaymentStatus("unpaid")}
              disabled={bulkProcessing || selectedInvoices.length === 0}
            >
              <Undo2 className="w-4 h-4 mr-1.5" />
              Reset
            </Button>
          </div>
        </div>
      )}

      {/* Member Invoices Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Member Invoices</CardTitle>
          <div className="flex items-center gap-3">
            <Select value={paymentStatusFilter} onValueChange={(v: any) => setPaymentStatusFilter(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="paid_cash">Paid Cash</SelectItem>
                <SelectItem value="paid_zelle">Paid Zelle</SelectItem>
                <SelectItem value="card_processed">Card Processed</SelectItem>
                <SelectItem value="card_declined">Card Declined</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v: "name" | "amount") => setSortBy(v)}>
              <SelectTrigger className="w-[160px]">
                <ArrowUpDown className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name (A-Z)</SelectItem>
                <SelectItem value="amount">Amount (High-Low)</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {filteredInvoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox 
                      checked={selectedInvoices.length === filteredInvoices.filter(i => i.status !== "paid_cash").length && filteredInvoices.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Email Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className={`cursor-pointer hover:bg-muted/50 ${invoice.status === "paid_cash" ? "opacity-60" : ""}`}
                    onClick={() => router.push(`/admin/billing/invoices/${invoice.id}`)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {invoice.status !== "paid_cash" && (
                        <Checkbox 
                          checked={selectedInvoices.includes(invoice.id)}
                          onCheckedChange={() => toggleInvoiceSelection(invoice.id)}
                        />
                      )}
                      {invoice.status === "paid_cash" && (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {invoice.member?.first_name} {invoice.member?.last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {invoice.member?.email || "-"}
                    </TableCell>
                    <TableCell className="text-right">{invoice.transaction_count}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {invoice.amount_paid && invoice.amount_paid > 0 ? (
                        <div>
                          <span className="text-green-600">₪{Number(invoice.amount_owed || 0).toFixed(2)}</span>
                          <span className="text-xs text-muted-foreground ml-1">
                            (of ₪{Number(invoice.total_amount).toFixed(2)})
                          </span>
                        </div>
                      ) : (
                        `₪${Number(invoice.total_amount).toFixed(2)}`
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status, invoice.payment_status, invoice.payment_details)}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        {(invoice.payment_status === "paid_cash" || invoice.payment_status === "card_processed" || invoice.payment_status === "card_declined" || invoice.status === "paid_cash") ? (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => handleUnmarkPayment(invoice.id, e)}
                            title="Reset to unpaid"
                          >
                            <Undo2 className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => handleMarkSingleAsCash(invoice.id, e)}
                            title="Mark as paid cash"
                          >
                            <Banknote className="w-4 h-4" />
                          </Button>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No invoices generated yet. Close the billing cycle to generate invoices.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Email Draft Dialog */}
      <Dialog open={showEmailDraft} onOpenChange={setShowEmailDraft}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email Message Draft</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This message will be included in all invoice emails. You can add a personalized note,
              payment instructions, or any other information.
            </p>
            <div className="space-y-2">
              <Label>Custom Message</Label>
              <Textarea
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="e.g., Payment is due within 14 days. Please contact us if you have any questions."
                rows={5}
              />
            </div>
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm font-medium mb-2">Email Preview</p>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>Hello [Member Name],</p>
                {emailMessage && (
                  <p className="bg-background p-2 rounded border">{emailMessage}</p>
                )}
                <p>
                  Here is your statement for the period {formatDate(cycle.start_date)} to{" "}
                  {formatDate(cycle.end_date)}.
                </p>
                <p className="font-medium">Total Amount Due: ₪[Amount]</p>
                <p className="text-xs">[Transaction details table will be included]</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDraft(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEmailMessage} disabled={savingMessage}>
              {savingMessage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Save Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
