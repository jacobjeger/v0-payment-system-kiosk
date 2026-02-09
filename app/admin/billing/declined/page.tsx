"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  CreditCard,
  Check,
  XCircle,
  Loader2,
  Clock,
  RefreshCw,
  Ban,
  ChevronRight,
  User,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { approveCardUpdate, rejectCardUpdate, getDecryptedPendingCard } from "@/app/actions/admin";

interface DeclinedMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  card_status: string;
  status: string;
  member_code: string;
}

interface PendingCardChange {
  id: string;
  member_id: string;
  request_type: string;
  status: string;
  created_at: string;
  admin_notes: string | null;
  new_card_number: string | null;
  new_card_cvc: string | null;
  new_card_exp_month: string | null;
  new_card_exp_year: string | null;
  new_card_zip: string | null;
  member?: DeclinedMember;
}

export default function DeclinedAccountsPage() {
  const [declinedMembers, setDeclinedMembers] = useState<DeclinedMember[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingCardChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Review dialog
  const [reviewRequest, setReviewRequest] = useState<PendingCardChange | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [decryptedCard, setDecryptedCard] = useState<{
    cardNumber?: string;
    cardCvc?: string;
    cardExpMonth?: string;
    cardExpYear?: string;
    cardZip?: string;
  } | null>(null);
  const [loadingCard, setLoadingCard] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const supabase = createClient();

    // Get all members with declined card status
    const { data: members } = await supabase
      .from("members")
      .select("id, first_name, last_name, email, phone, card_status, status, member_code")
      .eq("card_status", "declined")
      .order("last_name");

    // Get all pending card change requests
    const { data: requests } = await supabase
      .from("pending_card_changes")
      .select(`
        *,
        member:members(id, first_name, last_name, email, phone, card_status, status, member_code)
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    setDeclinedMembers(members || []);
    setPendingRequests(requests || []);
    setLoading(false);
  }

  async function handleResolve(requestId: string, newStatus: "resolved" | "still_declining") {
    setProcessing(requestId);

    // Use server actions that handle encrypted card data properly
    if (newStatus === "resolved") {
      await approveCardUpdate(requestId, adminNotes);
    } else {
      await rejectCardUpdate(requestId, adminNotes);
    }

    setAdminNotes("");
    setReviewRequest(null);
    setProcessing(null);
    await loadData();
  }

  async function handleDisableAccount(memberId: string) {
    setProcessing(memberId);
    const supabase = createClient();

    await supabase
      .from("members")
      .update({ status: "inactive" })
      .eq("id", memberId);

    setProcessing(null);
    await loadData();
  }

  async function handleEnableAccount(memberId: string) {
    setProcessing(memberId);
    const supabase = createClient();

    await supabase
      .from("members")
      .update({ status: "active" })
      .eq("id", memberId);

    setProcessing(null);
    await loadData();
  }

  async function handleResetCardStatus(memberId: string) {
    setProcessing(memberId);
    const supabase = createClient();

    await supabase
      .from("members")
      .update({ card_status: "active" })
      .eq("id", memberId);

    setProcessing(null);
    await loadData();
  }

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Filter members by search
  const filteredDeclined = declinedMembers.filter((member) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const name = `${member.first_name} ${member.last_name}`.toLowerCase();
    return name.includes(query) || member.email?.toLowerCase().includes(query) || member.member_code.toLowerCase().includes(query);
  });

  const filteredPending = pendingRequests.filter((request) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const member = request.member;
    if (!member) return false;
    const name = `${member.first_name} ${member.last_name}`.toLowerCase();
    return name.includes(query) || member.email?.toLowerCase().includes(query);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            Declined Accounts
          </h1>
          <p className="text-muted-foreground">
            Manage members with declined cards and review resolution requests
          </p>
        </div>
        <Input
          placeholder="Search members..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* Pending Resolution Requests */}
      {filteredPending.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              Pending Resolution Requests ({filteredPending.length})
            </CardTitle>
            <CardDescription>
              Members who have submitted a resolution request need your review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Request Type</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPending.map((request) => {
                  const member = request.member as DeclinedMember | undefined;
                  return (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-amber-600" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {member?.first_name} {member?.last_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {member?.email || member?.phone || "No contact"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                          request.request_type === "retry_charge" 
                            ? "bg-blue-100 text-blue-700" 
                            : "bg-purple-100 text-purple-700"
                        }`}>
                          {request.request_type === "retry_charge" ? (
                            <>
                              <RefreshCw className="w-3 h-3" />
                              Retry Charge
                            </>
                          ) : (
                            <>
                              <CreditCard className="w-3 h-3" />
                              Update Card
                            </>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(request.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-200 hover:bg-green-50 bg-transparent"
                            onClick={async () => {
                              setReviewRequest(request);
                              setAdminNotes("");
                              setDecryptedCard(null);
                              if (request.request_type === "update_card" && request.new_card_number) {
                                setLoadingCard(true);
                                const result = await getDecryptedPendingCard(request.id);
                                if (result.success && result.data) {
                                  setDecryptedCard(result.data);
                                }
                                setLoadingCard(false);
                              }
                            }}
                            disabled={processing === request.id}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Review
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Declined Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-500" />
            Members with Declined Cards ({declinedMembers.length})
          </CardTitle>
          <CardDescription>
            These members have card payment issues that need attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {declinedMembers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Account Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {declinedMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                          <span className="text-xs font-semibold text-red-600">
                            {member.first_name[0]}{member.last_name[0]}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">
                            {member.first_name} {member.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.member_code}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.email || member.phone || "No contact"}
                    </TableCell>
                    <TableCell>
                      {member.status === "active" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
                          <Check className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">
                          <Ban className="w-3 h-3" /> Disabled
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResetCardStatus(member.id)}
                          disabled={processing === member.id}
                        >
                          {processing === member.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="w-4 h-4 mr-1" />
                              Mark Resolved
                            </>
                          )}
                        </Button>
                        {member.status === "active" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50 bg-transparent"
                            onClick={() => handleDisableAccount(member.id)}
                            disabled={processing === member.id}
                          >
                            <Ban className="w-4 h-4 mr-1" />
                            Disable
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-200 hover:bg-green-50 bg-transparent"
                            onClick={() => handleEnableAccount(member.id)}
                            disabled={processing === member.id}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Enable
                          </Button>
                        )}
                        <Link href={`/admin/members/${member.id}`}>
                          <Button size="sm" variant="ghost">
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <p className="text-muted-foreground">No declined accounts</p>
              <p className="text-sm text-muted-foreground">All members have active payment methods</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Request Dialog */}
      <Dialog open={!!reviewRequest} onOpenChange={() => setReviewRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Resolution Request</DialogTitle>
            <DialogDescription>
              {reviewRequest?.request_type === "retry_charge" 
                ? "The member has requested to retry charging their card."
                : "The member has submitted new card information for review."}
            </DialogDescription>
          </DialogHeader>
          
          {reviewRequest && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Member</p>
                <p className="font-medium">
                  {(reviewRequest.member as DeclinedMember)?.first_name} {(reviewRequest.member as DeclinedMember)?.last_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {(reviewRequest.member as DeclinedMember)?.email}
                </p>
              </div>

              {/* Show new card details if this is a card update request */}
              {reviewRequest.request_type === "update_card" && reviewRequest.new_card_number && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-purple-900 mb-2 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    New Card Submitted
                  </p>
                  {loadingCard ? (
                    <div className="flex items-center gap-2 text-sm text-purple-600">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading card details...
                    </div>
                  ) : decryptedCard ? (
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-purple-600">Card Number:</span>
                        <span className="ml-2 font-mono font-medium text-purple-900">{decryptedCard.cardNumber}</span>
                      </div>
                      <div className="flex gap-4">
                        <div>
                          <span className="text-purple-600">Expires:</span>
                          <span className="ml-2 font-medium">{decryptedCard.cardExpMonth}/{decryptedCard.cardExpYear}</span>
                        </div>
                        <div>
                          <span className="text-purple-600">CVC:</span>
                          <span className="ml-2 font-mono font-medium">{decryptedCard.cardCvc}</span>
                        </div>
                      </div>
                      {decryptedCard.cardZip && (
                        <div>
                          <span className="text-purple-600">ZIP:</span>
                          <span className="ml-2 font-medium">{decryptedCard.cardZip}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-red-600">Failed to load card details</p>
                  )}
                  <p className="text-xs text-purple-700 mt-3">
                    Approving will update the member's card on file with this new card.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Admin Notes (optional)</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add any notes about this resolution..."
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setReviewRequest(null)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50 bg-transparent"
              onClick={() => reviewRequest && handleResolve(reviewRequest.id, "still_declining")}
              disabled={processing === reviewRequest?.id}
            >
              {processing === reviewRequest?.id ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4 mr-2" />
              )}
              Deny
            </Button>
            <Button
              onClick={() => reviewRequest && handleResolve(reviewRequest.id, "resolved")}
              disabled={processing === reviewRequest?.id}
            >
              {processing === reviewRequest?.id ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
