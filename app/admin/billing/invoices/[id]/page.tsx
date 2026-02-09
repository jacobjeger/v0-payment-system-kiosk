"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Mail,
  Send,
  Check,
  Clock,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  Save,
  RefreshCw,
} from "lucide-react";
import {
  getInvoiceTransactions,
  getInvoiceEmailStatus,
  updateTransaction,
  deleteTransaction,
  recalculateInvoice,
  sendInvoiceEmail,
  updateInvoiceMessage,
} from "@/app/actions/billing";
import type { Invoice, Member, BillingCycle, Transaction, Business } from "@/lib/types";

interface InvoiceData extends Invoice {
  member: Member | null;
  billing_cycle: BillingCycle | null;
}

interface TransactionWithBusiness extends Transaction {
  business: Business | null;
}

export default function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithBusiness[]>([]);
  const [emailStatus, setEmailStatus] = useState<{
    status: string;
    created_at: string;
    delivered_at?: string;
    opened_at?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  // Edit transaction dialog
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithBusiness | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Email message
  const [editingMessage, setEditingMessage] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  const [savingMessage, setSavingMessage] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    const data = await getInvoiceTransactions(id);
    if (data) {
      setInvoice(data.invoice as InvoiceData);
      setTransactions(data.transactions as TransactionWithBusiness[]);
      setEmailMessage(data.invoice.email_message || "");
      
      // Load email status if invoice was sent
      if (data.invoice.sent_at && data.invoice.member?.email) {
        const status = await getInvoiceEmailStatus(id, data.invoice.member.email);
        setEmailStatus(status);
      }
    }
    setLoading(false);
  }

  function openEditDialog(tx: TransactionWithBusiness) {
    setEditingTransaction(tx);
    setEditAmount(String(tx.amount));
    setEditDescription(tx.description || "");
  }

  async function handleSaveEdit() {
    if (!editingTransaction) return;
    setSaving(true);
    await updateTransaction(editingTransaction.id, {
      amount: parseFloat(editAmount),
      description: editDescription || undefined,
    });
    setEditingTransaction(null);
    await loadData();
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    await deleteTransaction(deleteId);
    setDeleteId(null);
    await loadData();
    setDeleting(false);
  }

  async function handleRecalculate() {
    setRecalculating(true);
    const result = await recalculateInvoice(id);
    if (result.success) {
      await loadData();
    }
    setRecalculating(false);
  }

  async function handleSendEmail() {
    setSending(true);
    const result = await sendInvoiceEmail(id);
    if (result.success) {
      await loadData();
    } else {
      alert("Failed to send email: " + result.error);
    }
    setSending(false);
  }

  async function handleSaveMessage() {
    setSavingMessage(true);
    await updateInvoiceMessage(id, emailMessage);
    setEditingMessage(false);
    await loadData();
    setSavingMessage(false);
  }

  // Format date without timezone conversion (prevents day shift issues)
  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('T')[0].split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIndex = parseInt(month, 10) - 1;
    return `${monthNames[monthIndex]} ${parseInt(day, 10)}, ${year}`;
  };

  const formatDateTime = (date: string) =>
    new Date(date).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-muted text-muted-foreground">
            <Clock className="w-4 h-4" /> Pending
          </span>
        );
      case "sent":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-700">
            <Send className="w-4 h-4" /> Sent
          </span>
        );
      case "delivered":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-green-100 text-green-700">
            <Check className="w-4 h-4" /> Delivered
          </span>
        );
      case "opened":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-purple-100 text-purple-700">
            <Eye className="w-4 h-4" /> Opened
          </span>
        );
      case "paid":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-emerald-100 text-emerald-700">
            <Check className="w-4 h-4" /> Paid
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

  if (!invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Invoice not found</p>
      </div>
    );
  }

  const calculatedTotal = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const needsRecalculation = Math.abs(calculatedTotal - Number(invoice.total_amount)) > 0.01;

  // Group transactions by business
  const businessTotals = transactions.reduce((acc, tx) => {
    const businessId = tx.business?.name || "Unknown";
    if (!acc[businessId]) {
      acc[businessId] = { name: businessId, total: 0, count: 0 };
    }
    acc[businessId].total += Number(tx.amount);
    acc[businessId].count += 1;
    return acc;
  }, {} as Record<string, { name: string; total: number; count: number }>);

  const businessSummary = Object.values(businessTotals).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              router.push(`/admin/billing/cycles/${invoice.billing_cycle_id}`)
            }
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Cycle
          </Button>
        </div>
        <div className="flex items-center gap-3">
          {invoice.status === "pending" && invoice.member?.email && (
            <Button onClick={handleSendEmail} disabled={sending}>
              {sending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Send Invoice Email
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Header Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
            <div>
              <h1 className="text-2xl font-bold mb-1">
                {invoice.member?.first_name} {invoice.member?.last_name}
              </h1>
              <p className="text-muted-foreground">{invoice.member?.email || "No email on file"}</p>
              <p className="text-muted-foreground">{invoice.member?.phone || ""}</p>
              <div className="mt-4">{getStatusBadge(invoice.status)}</div>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground mb-1">
                {invoice.billing_cycle?.name || "Billing Cycle"}
              </p>
              <p className="text-sm text-muted-foreground">
                {invoice.billing_cycle &&
                  `${formatDate(invoice.billing_cycle.start_date)} - ${formatDate(
                    invoice.billing_cycle.end_date
                  )}`}
              </p>
              <div className="mt-4 bg-primary/5 px-6 py-4 rounded-lg inline-block">
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-3xl font-bold text-primary">
                  ₪{Number(invoice.total_amount).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Email Message Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Email Message</CardTitle>
          {!editingMessage && (
            <Button variant="ghost" size="sm" onClick={() => setEditingMessage(true)}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editingMessage ? (
            <div className="space-y-4">
              <Textarea
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="Add a custom message to include in the invoice email..."
                rows={4}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setEditingMessage(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveMessage} disabled={savingMessage}>
                  {savingMessage ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {invoice.email_message || "No custom message set. Click Edit to add one."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Business Summary */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            Spending by Business ({businessSummary.length} businesses, {transactions.length} transactions)
          </CardTitle>
          {needsRecalculation && (
            <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={recalculating}>
              {recalculating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Recalculate Total
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {businessSummary.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead className="text-center">Transactions</TableHead>
                  <TableHead className="text-right">Total Spent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businessSummary.map((biz) => (
                  <TableRow key={biz.name}>
                    <TableCell className="font-medium">{biz.name}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{biz.count}</TableCell>
                    <TableCell className="text-right font-semibold">
                      ₪{biz.total.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <tfoot>
                <tr className="border-t-2 bg-muted/50">
                  <td className="px-4 py-3 font-bold">Total</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{transactions.length}</td>
                  <td className="px-4 py-3 text-right font-bold text-lg">
                    ₪{calculatedTotal.toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-8">No transactions found.</p>
          )}
        </CardContent>
      </Card>

      {/* Edit Transaction Dialog */}
      <Dialog open={!!editingTransaction} onOpenChange={(open) => !open && setEditingTransaction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Amount (₪)</Label>
              <Input
                type="number"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTransaction(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The transaction will be permanently removed from this invoice.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Status Info */}
      {invoice.sent_at && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Tracking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Email recipient info */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Sent to:</span>{" "}
                  <span className="font-medium">{invoice.email_sent_to}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Sent at:</span>{" "}
                  <span className="font-medium">{formatDateTime(invoice.sent_at)}</span>
                </div>
              </div>
              
              {/* Email tracking timeline */}
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="flex flex-col gap-3">
                  {/* Sent */}
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Send className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Sent</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(invoice.sent_at)}</p>
                    </div>
                  </div>
                  
                  {/* Delivered */}
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      emailStatus?.delivered_at || emailStatus?.status === 'delivered' || emailStatus?.status === 'opened'
                        ? 'bg-green-100'
                        : 'bg-muted'
                    }`}>
                      <Check className={`w-4 h-4 ${
                        emailStatus?.delivered_at || emailStatus?.status === 'delivered' || emailStatus?.status === 'opened'
                          ? 'text-green-600'
                          : 'text-muted-foreground'
                      }`} />
                    </div>
                    <div>
                      <p className={`font-medium text-sm ${
                        !(emailStatus?.delivered_at || emailStatus?.status === 'delivered' || emailStatus?.status === 'opened')
                          ? 'text-muted-foreground'
                          : ''
                      }`}>Delivered</p>
                      {emailStatus?.delivered_at && (
                        <p className="text-xs text-muted-foreground">{formatDateTime(emailStatus.delivered_at)}</p>
                      )}
                      {!emailStatus?.delivered_at && emailStatus?.status !== 'delivered' && emailStatus?.status !== 'opened' && (
                        <p className="text-xs text-muted-foreground">Waiting for delivery confirmation</p>
                      )}
                    </div>
                  </div>
                  
                  {/* Opened */}
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      emailStatus?.opened_at || emailStatus?.status === 'opened'
                        ? 'bg-purple-100'
                        : 'bg-muted'
                    }`}>
                      <Eye className={`w-4 h-4 ${
                        emailStatus?.opened_at || emailStatus?.status === 'opened'
                          ? 'text-purple-600'
                          : 'text-muted-foreground'
                      }`} />
                    </div>
                    <div>
                      <p className={`font-medium text-sm ${
                        !(emailStatus?.opened_at || emailStatus?.status === 'opened')
                          ? 'text-muted-foreground'
                          : ''
                      }`}>Opened</p>
                      {emailStatus?.opened_at ? (
                        <p className="text-xs text-muted-foreground">{formatDateTime(emailStatus.opened_at)}</p>
                      ) : emailStatus?.status === 'opened' ? (
                        <p className="text-xs text-green-600">Email was opened</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Not opened yet</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Bounced warning */}
              {emailStatus?.status === 'bounced' && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-destructive/20 flex items-center justify-center">
                    <span className="text-destructive font-bold">!</span>
                  </div>
                  <div>
                    <p className="font-medium text-sm text-destructive">Email Bounced</p>
                    <p className="text-xs text-muted-foreground">The email could not be delivered to this address</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
