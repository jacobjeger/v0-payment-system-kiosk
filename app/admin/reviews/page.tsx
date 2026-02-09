"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { 
  ArrowLeft, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  MessageSquare,
  Trash2,
  Edit,
} from "lucide-react";
import { resolveDispute } from "@/app/actions/business";

interface TransactionReview {
  id: string;
  transaction_id: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "resolved";
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
  transaction: {
    id: string;
    amount: number;
    description: string | null;
    created_at: string;
    member: {
      first_name: string;
      last_name: string;
    };
  };
  business: {
    id: string;
    name: string;
  };
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<TransactionReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "resolved">("pending");
  const [selectedReview, setSelectedReview] = useState<TransactionReview | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(false);
  const [editAmount, setEditAmount] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadReviews();
  }, [statusFilter]);

  async function loadReviews() {
    const supabase = createClient();
    
    let query = supabase
      .from("transaction_reviews")
      .select(`
        id,
        transaction_id,
        reason,
        status,
        admin_notes,
        created_at,
        resolved_at,
        transaction:transactions(
          id,
          amount,
          description,
          created_at,
          member:members(first_name, last_name)
        ),
        business:businesses(id, name)
      `)
      .order("created_at", { ascending: false });

    if (statusFilter === "pending") {
      query = query.eq("status", "pending");
    } else if (statusFilter === "resolved") {
      query = query.neq("status", "pending");
    }

    const { data } = await query;
    setReviews((data as unknown as TransactionReview[]) || []);
    setLoading(false);
  }

  async function handleResolve(action: "approved" | "rejected" | "resolved") {
    if (!selectedReview) return;
    setProcessing(true);
    
    // Map action to status for the resolveDispute function
    const status = action === "approved" ? "resolved" : action === "rejected" ? "rejected" : "resolved";
    
    await resolveDispute({
      reviewId: selectedReview.id,
      status,
      adminNotes: adminNotes || undefined,
    });

    setSelectedReview(null);
    setAdminNotes("");
    await loadReviews();
    setProcessing(false);
  }

  async function handleUpdateTransaction() {
    if (!selectedReview || !editAmount) return;
    setProcessing(true);
    
    const notes = adminNotes || `Amount updated from ₪${selectedReview.transaction.amount} to ₪${editAmount}`;
    
    await resolveDispute({
      reviewId: selectedReview.id,
      status: "resolved",
      adminNotes: notes,
      newAmount: parseFloat(editAmount),
    });

    setSelectedReview(null);
    setAdminNotes("");
    setEditingTransaction(false);
    setEditAmount("");
    await loadReviews();
    setProcessing(false);
  }

  async function handleDeleteTransaction() {
    if (!selectedReview) return;
    if (!confirm("Are you sure you want to delete this transaction? This cannot be undone.")) return;
    
    setProcessing(true);
    const supabase = createClient();
    
    // Delete the transaction (review will be deleted via CASCADE)
    await supabase
      .from("transactions")
      .delete()
      .eq("id", selectedReview.transaction_id);

    setSelectedReview(null);
    await loadReviews();
    setProcessing(false);
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="border-orange-300 text-orange-600"><Clock className="w-3 h-3 mr-1" /> Pending</Badge>;
      case "approved":
        return <Badge className="bg-green-100 text-green-700"><CheckCircle className="w-3 h-3 mr-1" /> Approved</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-700"><XCircle className="w-3 h-3 mr-1" /> Rejected</Badge>;
      case "resolved":
        return <Badge className="bg-blue-100 text-blue-700"><CheckCircle className="w-3 h-3 mr-1" /> Resolved</Badge>;
      default:
        return null;
    }
  }

  const pendingCount = reviews.filter(r => r.status === "pending").length;

  // Filter reviews by search
  const filteredReviews = reviews.filter((review) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const memberName = `${review.transaction.member.first_name} ${review.transaction.member.last_name}`.toLowerCase();
    const businessName = review.business.name.toLowerCase();
    return memberName.includes(query) || businessName.includes(query) || review.reason.toLowerCase().includes(query);
  });

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Transaction Reviews</h1>
            <p className="text-muted-foreground">Review flagged transactions from businesses</p>
          </div>
        </div>
        {pendingCount > 0 && (
          <Badge variant="destructive" className="text-lg px-3 py-1">
            {pendingCount} Pending
          </Badge>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex gap-2">
          {(["pending", "all", "resolved"] as const).map((filter) => (
            <Button
              key={filter}
              variant={statusFilter === filter ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(filter)}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Button>
          ))}
        </div>
        <Input
          placeholder="Search by member, business, or reason..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* Reviews Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date Flagged</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredReviews.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "No reviews match your search" : "No reviews found"}
                </TableCell>
              </TableRow>
            ) : (
              filteredReviews.map((review) => (
                <TableRow key={review.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {new Date(review.created_at).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.created_at).toLocaleTimeString()}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {review.business?.name}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">₪{Number(review.transaction?.amount || 0).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">
                        {review.transaction?.member?.first_name} {review.transaction?.member?.last_name}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <p className="text-sm truncate" title={review.reason}>
                      {review.reason}
                    </p>
                  </TableCell>
                  <TableCell>{getStatusBadge(review.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedReview(review);
                        setAdminNotes(review.admin_notes || "");
                        setEditAmount(String(review.transaction?.amount || 0));
                      }}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      {review.status === "pending" ? "Review" : "View"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!selectedReview} onOpenChange={(open) => !open && setSelectedReview(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Review Transaction
            </DialogTitle>
          </DialogHeader>
          
          {selectedReview && (
            <div className="space-y-4">
              {/* Transaction Details */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Transaction Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Business:</span>
                    <span className="font-medium">{selectedReview.business?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Member:</span>
                    <span className="font-medium">
                      {selectedReview.transaction?.member?.first_name} {selectedReview.transaction?.member?.last_name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date:</span>
                    <span className="font-medium">
                      {new Date(selectedReview.transaction?.created_at || "").toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Amount:</span>
                    {editingTransaction ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="w-32 text-right"
                      />
                    ) : (
                      <span className="font-bold text-lg">₪{Number(selectedReview.transaction?.amount || 0).toFixed(2)}</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Reason */}
              <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                <p className="text-sm font-medium text-orange-800 mb-1">Reason for Review:</p>
                <p className="text-sm text-orange-700">{selectedReview.reason}</p>
              </div>

              {/* Admin Notes */}
              <div className="space-y-2">
                <Label htmlFor="adminNotes">Admin Notes</Label>
                <Textarea
                  id="adminNotes"
                  placeholder="Add notes about your decision..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  rows={3}
                  disabled={selectedReview.status !== "pending"}
                />
              </div>

              {selectedReview.status !== "pending" && selectedReview.resolved_at && (
                <div className="text-sm text-muted-foreground">
                  Resolved on {new Date(selectedReview.resolved_at).toLocaleString()}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {selectedReview?.status === "pending" && (
              <>
                {editingTransaction ? (
                  <>
                    <Button variant="outline" onClick={() => setEditingTransaction(false)}>
                      Cancel Edit
                    </Button>
                    <Button onClick={handleUpdateTransaction} disabled={processing}>
                      {processing ? "Saving..." : "Save & Resolve"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={handleDeleteTransaction}
                      disabled={processing}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setEditingTransaction(true)}
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit Amount
                    </Button>
                    <Button 
                      variant="outline"
                      onClick={() => handleResolve("rejected")}
                      disabled={processing}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button 
                      onClick={() => handleResolve("resolved")}
                      disabled={processing}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Resolve
                    </Button>
                  </>
                )}
              </>
            )}
            {selectedReview?.status !== "pending" && (
              <Button variant="outline" onClick={() => setSelectedReview(null)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
