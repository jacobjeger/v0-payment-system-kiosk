"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2 } from "lucide-react";
import { updateTransaction, deleteTransaction } from "@/app/actions/admin";

interface Transaction {
  id: string;
  amount: number | string;
  balance_before: number | string;
  balance_after: number | string;
  description: string | null;
  created_at: string;
  business_id: string;
  businesses: { id: string; name: string } | null;
}

interface Business {
  id: string;
  name: string;
}

interface TransactionTableProps {
  transactions: Transaction[];
  memberId: string;
  businesses: Business[];
}

export function TransactionTable({ transactions, memberId, businesses }: TransactionTableProps) {
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditAmount(String(Number(tx.amount)));
    setEditDescription(tx.description || "");
  };

  const handleSaveEdit = async () => {
    if (!editingTx) return;
    setLoading(true);

    const result = await updateTransaction(editingTx.id, memberId, {
      amount: parseFloat(editAmount),
      description: editDescription,
    });

    setLoading(false);
    if (result.success) {
      setEditingTx(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setLoading(true);

    const result = await deleteTransaction(deleteConfirm.id, memberId);

    setLoading(false);
    if (result.success) {
      setDeleteConfirm(null);
    }
  };

  if (transactions.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        No transactions yet
      </p>
    );
  }

  return (
    <>
      <div className="border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance After</TableHead>
              <TableHead className="text-right w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="text-muted-foreground">
                  {new Date(tx.created_at).toLocaleString()}
                </TableCell>
                <TableCell>{tx.businesses?.name || "-"}</TableCell>
                <TableCell className="text-muted-foreground max-w-[200px] truncate">
                  {tx.description || "-"}
                </TableCell>
                <TableCell className="text-right font-medium">
                  ₪{Number(tx.amount).toFixed(2)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  ₪{Number(tx.balance_after).toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(tx)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteConfirm(tx)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingTx} onOpenChange={() => setEditingTx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground">Amount (₪)</label>
              <Input
                type="number"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Description</label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="mt-1"
                placeholder="Enter description..."
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Business</label>
              <p className="mt-1 text-foreground">{editingTx?.businesses?.name || "-"}</p>
              <p className="text-xs text-muted-foreground mt-1">Business cannot be changed. Delete and create a new transaction if needed.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTx(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Transaction</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-muted-foreground">
            Are you sure you want to delete this transaction for ₪{Number(deleteConfirm?.amount || 0).toFixed(2)}? 
            This will also reverse the balance change.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? "Deleting..." : "Delete Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
