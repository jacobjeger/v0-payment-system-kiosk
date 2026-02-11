"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { approveOwnerOffset, rejectOwnerOffset, getOwnerOffsetsForCycle } from "@/app/actions/billing";

interface OwnerOffset {
  id: string;
  billing_cycle_id: string;
  member_id: string;
  offset_amount: number;
  status: "pending" | "approved" | "rejected" | "finalized";
  requested_at: string;
  approved_at?: string;
  rejected_at?: string;
  member?: {
    id: string;
    first_name: string;
    last_name: string;
    balance: number;
  };
}

interface OwnerOffsetsCardProps {
  cycleId: string;
  onOffsetsUpdated?: () => void;
}

export function OwnerOffsetsCard({ cycleId, onOffsetsUpdated }: OwnerOffsetsCardProps) {
  const [offsets, setOffsets] = useState<OwnerOffset[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    loadOffsets();
  }, [cycleId]);

  async function loadOffsets() {
    setLoading(true);
    const result = await getOwnerOffsetsForCycle(cycleId);
    if (result.success) {
      setOffsets(result.offsets as OwnerOffset[]);
    }
    setLoading(false);
  }

  async function handleApprove(offsetId: string) {
    setProcessing(offsetId);
    const result = await approveOwnerOffset(offsetId);
    if (result.success) {
      await loadOffsets();
      onOffsetsUpdated?.();
    }
    setProcessing(null);
  }

  async function handleReject(offsetId: string) {
    setProcessing(offsetId);
    const result = await rejectOwnerOffset(offsetId);
    if (result.success) {
      await loadOffsets();
      onOffsetsUpdated?.();
    }
    setProcessing(null);
  }

  const pendingOffsets = offsets.filter((o) => o.status === "pending");
  const approvedOffsets = offsets.filter((o) => o.status === "approved");
  const rejectedOffsets = offsets.filter((o) => o.status === "rejected");
  const finalizedOffsets = offsets.filter((o) => o.status === "finalized");

  const totalOffsetAmount = offsets
    .filter((o) => o.status === "approved" || o.status === "finalized")
    .reduce((sum, o) => sum + o.offset_amount, 0);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            Owner Balance Offsets
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (offsets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            Owner Balance Offsets
          </CardTitle>
          <CardDescription>
            No business owners with member balances in this cycle
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              Owner Balance Offsets
            </CardTitle>
            <CardDescription>
              Review and approve member balance offsets for business owners before closing the cycle
            </CardDescription>
          </div>
          {totalOffsetAmount > 0 && (
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Approved Offsets</p>
              <p className="text-xl font-bold text-green-600">₪{totalOffsetAmount.toFixed(2)}</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Pending Offsets */}
        {pendingOffsets.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              Pending Approval ({pendingOffsets.length})
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Business Owner</TableHead>
                    <TableHead className="text-right">Member Balance</TableHead>
                    <TableHead className="text-right">Offset Amount</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingOffsets.map((offset) => (
                    <TableRow key={offset.id}>
                      <TableCell className="font-medium">
                        {offset.member
                          ? `${offset.member.first_name} ${offset.member.last_name}`
                          : "Unknown"}
                      </TableCell>
                      <TableCell className="text-right">
                        ₪{offset.member?.balance.toFixed(2) || "0.00"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-amber-600">
                        ₪{offset.offset_amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex gap-2 justify-center">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleApprove(offset.id)}
                            disabled={processing === offset.id}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {processing === offset.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <CheckCircle className="w-3 h-3 mr-1" />
                            )}
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(offset.id)}
                            disabled={processing === offset.id}
                          >
                            {processing === offset.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <XCircle className="w-3 h-3 mr-1" />
                            )}
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Approved Offsets */}
        {approvedOffsets.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Approved ({approvedOffsets.length})
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-green-50">
                    <TableHead>Business Owner</TableHead>
                    <TableHead className="text-right">Offset Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvedOffsets.map((offset) => (
                    <TableRow key={offset.id} className="bg-green-50/30">
                      <TableCell className="font-medium">
                        {offset.member
                          ? `${offset.member.first_name} ${offset.member.last_name}`
                          : "Unknown"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        ₪{offset.offset_amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                          Approved
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Rejected Offsets */}
        {rejectedOffsets.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              Rejected ({rejectedOffsets.length})
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-red-50">
                    <TableHead>Business Owner</TableHead>
                    <TableHead className="text-right">Offset Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rejectedOffsets.map((offset) => (
                    <TableRow key={offset.id} className="bg-red-50/30">
                      <TableCell className="font-medium">
                        {offset.member
                          ? `${offset.member.first_name} ${offset.member.last_name}`
                          : "Unknown"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ₪{offset.offset_amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="destructive">Rejected</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Finalized Offsets */}
        {finalizedOffsets.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-blue-600" />
              Applied ({finalizedOffsets.length})
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-blue-50">
                    <TableHead>Business Owner</TableHead>
                    <TableHead className="text-right">Offset Amount</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {finalizedOffsets.map((offset) => (
                    <TableRow key={offset.id} className="bg-blue-50/30">
                      <TableCell className="font-medium">
                        {offset.member
                          ? `${offset.member.first_name} ${offset.member.last_name}`
                          : "Unknown"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-blue-600">
                        ₪{offset.offset_amount.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-blue-100 text-blue-700">Applied</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
