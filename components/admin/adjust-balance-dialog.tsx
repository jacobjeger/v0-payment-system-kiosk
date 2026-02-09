"use client";

import React from "react"

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addBalanceAdjustment } from "@/app/actions/transactions";
import type { Member } from "@/lib/types";

interface AdjustBalanceDialogProps {
  member: Member;
  open: boolean;
  onClose: () => void;
}

export function AdjustBalanceDialog({
  member,
  open,
  onClose,
}: AdjustBalanceDialogProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"deposit" | "withdrawal" | "correction">("deposit");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const amountStr = formData.get("amount") as string;
    const notes = formData.get("notes") as string;

    let amount = parseFloat(amountStr);
    if (adjustmentType === "withdrawal") {
      amount = -Math.abs(amount);
    } else if (adjustmentType === "deposit") {
      amount = Math.abs(amount);
    }

    const result = await addBalanceAdjustment({
      memberId: member.id,
      amount,
      adjustmentType,
      notes: notes || undefined,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.refresh();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust Balance</DialogTitle>
        </DialogHeader>

        <div className="bg-accent/50 rounded-lg p-4 mb-4">
          <p className="text-sm text-muted-foreground">Member</p>
          <p className="font-medium text-foreground">
            {member.first_name} {member.last_name} ({member.member_code})
          </p>
          <p className="text-sm text-muted-foreground mt-2">Current Balance</p>
          <p className="text-2xl font-bold text-primary">
            ₪{Number(member.balance).toFixed(2)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="type">Adjustment Type</Label>
            <Select
              value={adjustmentType}
              onValueChange={(value) => setAdjustmentType(value as typeof adjustmentType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deposit">Deposit (Add Funds)</SelectItem>
                <SelectItem value="withdrawal">Withdrawal (Remove Funds)</SelectItem>
                <SelectItem value="correction">Correction</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">
              Amount (₪)
              {adjustmentType === "correction" && (
                <span className="text-muted-foreground font-normal ml-2">
                  (use negative for deduction)
                </span>
              )}
            </Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              step="0.01"
              min={adjustmentType === "correction" ? undefined : "0.01"}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              name="notes"
              placeholder="Reason for adjustment"
            />
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Processing..." : "Apply Adjustment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
