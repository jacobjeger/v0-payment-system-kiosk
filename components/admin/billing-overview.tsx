"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "@/components/ui/dialog";
import { TrendingUp, TrendingDown, Users, Receipt, FileText, X, AlertTriangle, Calendar, CreditCard } from "lucide-react";
import Link from "next/link";

interface MemberBillingData {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  balance: number;
  currentMonthTotal: number;
  currentMonthCount: number;
  lastMonthTotal: number;
}

interface Transaction {
  id: string;
  member_id: string;
  amount: number;
  description: string | null;
  created_at: string;
  businesses: { name: string } | null;
}

interface BillingStats {
  totalCurrentMonth: number;
  totalLastMonth: number;
  totalTransactions: number;
  activeMembers: number;
  currentMonthName: string;
  lastMonthName: string;
}

interface BillingOverviewProps {
  memberBillingData: MemberBillingData[];
  currentMonthTransactions: Transaction[];
  stats: BillingStats;
}

export function BillingOverview({
  memberBillingData,
  currentMonthTransactions,
  stats,
}: BillingOverviewProps) {
  const [search, setSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<MemberBillingData | null>(null);
  const [showStatement, setShowStatement] = useState(false);

  const filteredMembers = memberBillingData.filter((member) => {
    const searchLower = search.toLowerCase();
    return (
      member.firstName.toLowerCase().includes(searchLower) ||
      member.lastName.toLowerCase().includes(searchLower) ||
      member.email?.toLowerCase().includes(searchLower)
    );
  });

  // Sort by current month total (highest first)
  const sortedMembers = [...filteredMembers].sort(
    (a, b) => b.currentMonthTotal - a.currentMonthTotal
  );

  const memberTransactions = selectedMember
    ? currentMonthTransactions.filter((tx) => tx.member_id === selectedMember.id)
    : [];

  const monthChange = stats.totalLastMonth > 0
    ? ((stats.totalCurrentMonth - stats.totalLastMonth) / stats.totalLastMonth) * 100
    : 0;

  return (
    <div>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {stats.currentMonthName}
                </p>
                <p className="text-3xl font-bold text-foreground mt-2">
                  ₪{stats.totalCurrentMonth.toFixed(2)}
                </p>
              </div>
              <div className="bg-primary/10 p-3 rounded-xl">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
            </div>
            {stats.totalLastMonth > 0 && (
              <p className={`text-sm mt-2 ${monthChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                {monthChange >= 0 ? "+" : ""}{monthChange.toFixed(1)}% vs last month
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {stats.lastMonthName}
                </p>
                <p className="text-3xl font-bold text-foreground mt-2">
                  ₪{stats.totalLastMonth.toFixed(2)}
                </p>
              </div>
              <div className="bg-muted p-3 rounded-xl">
                <TrendingDown className="w-6 h-6 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Active Members
                </p>
                <p className="text-3xl font-bold text-foreground mt-2">
                  {stats.activeMembers}
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded-xl">
                <Users className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Made purchases this month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Transactions
                </p>
                <p className="text-3xl font-bold text-foreground mt-2">
                  {stats.totalTransactions}
                </p>
              </div>
              <div className="bg-orange-50 p-3 rounded-xl">
                <Receipt className="w-6 h-6 text-orange-600" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              This month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Link href="/admin/billing/cycles">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Calendar className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Billing Cycles</h3>
                  <p className="text-sm text-muted-foreground">Manage billing periods</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/billing/declined">
          <Card className="hover:border-red-300 transition-colors cursor-pointer border-red-100">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold">Declined Accounts</h3>
                  <p className="text-sm text-muted-foreground">Review card issues</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="border-muted">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <CreditCard className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">Card Processing</h3>
                <p className="text-sm text-muted-foreground">Export for batch processing</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Member Bills Table */}
      <Card>
        <CardHeader>
          <CardTitle>Member Billing</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="mb-6">
            <Input
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>

          {/* Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Current Balance</TableHead>
                  <TableHead className="text-right">This Month</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Last Month</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      {member.firstName} {member.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.email || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={member.balance < 0 ? "text-destructive" : "text-foreground"}>
                        ₪{member.balance.toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-primary">
                      ₪{member.currentMonthTotal.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {member.currentMonthCount}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      ₪{member.lastMonthTotal.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedMember(member);
                          setShowStatement(true);
                        }}
                        className="gap-2"
                      >
                        <FileText className="w-4 h-4" />
                        Statement
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {sortedMembers.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                {search ? "No members found" : "No members yet"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Statement Modal */}
      <Dialog open={showStatement} onOpenChange={setShowStatement}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Monthly Statement</span>
            </DialogTitle>
          </DialogHeader>

          {selectedMember && (
            <div className="space-y-6">
              {/* Member Info */}
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {selectedMember.firstName} {selectedMember.lastName}
                    </h3>
                    {selectedMember.email && (
                      <p className="text-sm text-muted-foreground">{selectedMember.email}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Statement Period</p>
                    <p className="font-medium">{stats.currentMonthName}</p>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-primary/5 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Total Charges</p>
                  <p className="text-2xl font-bold text-primary">
                    ₪{selectedMember.currentMonthTotal.toFixed(2)}
                  </p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">Current Balance</p>
                  <p className={`text-2xl font-bold ${selectedMember.balance < 0 ? "text-destructive" : "text-foreground"}`}>
                    ₪{selectedMember.balance.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Transaction List */}
              <div>
                <h4 className="font-semibold mb-3">Transactions</h4>
                {memberTransactions.length > 0 ? (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Business</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {memberTransactions.map((tx) => (
                          <TableRow key={tx.id}>
                            <TableCell className="text-muted-foreground">
                              {new Date(tx.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>{tx.businesses?.name || "-"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {tx.description || "-"}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              ₪{Number(tx.amount).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    No transactions this month
                  </p>
                )}
              </div>

              {/* Print Button */}
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowStatement(false)}>
                  Close
                </Button>
                <Button onClick={() => window.print()}>
                  Print Statement
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
