"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdjustBalanceDialog } from "./adjust-balance-dialog";
import { bulkSendLoginInfo, bulkDeleteMembers } from "@/app/actions/admin";
import { Mail, Loader2, Trash2, UserX } from "lucide-react";
import type { Member } from "@/lib/types";

interface MemberListProps {
  members: Member[];
}

export function MemberList({ members }: MemberListProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [accountFilter, setAccountFilter] = useState<"all" | "with_account" | "without_account">("all");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendingLogin, setSendingLogin] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredMembers = members.filter((member) => {
    const searchLower = search.toLowerCase();
    const matchesSearch = (
      member.first_name.toLowerCase().includes(searchLower) ||
      member.last_name.toLowerCase().includes(searchLower) ||
      member.email?.toLowerCase().includes(searchLower)
    );
    
    const matchesStatus = 
      statusFilter === "all" ||
      (statusFilter === "active" && member.status === "active") ||
      (statusFilter === "paused" && member.status === "paused");
    
    const matchesAccount = 
      accountFilter === "all" ||
      (accountFilter === "with_account" && member.auth_user_id) ||
      (accountFilter === "without_account" && !member.auth_user_id);
    
    return matchesSearch && matchesStatus && matchesAccount;
  });

  const pausedCount = members.filter(m => m.status === "paused").length;
  const withoutAccountCount = members.filter(m => !m.auth_user_id).length;

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredMembers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMembers.map(m => m.id)));
    }
  };

  const handleBulkSendLogin = async () => {
    if (selectedIds.size === 0) return;
    setSendingLogin(true);
    const result = await bulkSendLoginInfo(Array.from(selectedIds));
    setSendingLogin(false);
    
    if (result.success) {
      alert(`Login info sent to ${result.sent} member(s).${result.failed > 0 ? ` Failed: ${result.failed}` : ''}`);
      setSelectedIds(new Set());
    } else {
      alert("Error: " + result.error);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    const confirmed = confirm(`Are you sure you want to delete ${selectedIds.size} member(s)? This action cannot be undone.`);
    if (!confirmed) return;
    
    setDeleting(true);
    const result = await bulkDeleteMembers(Array.from(selectedIds));
    setDeleting(false);
    
    if (result.success) {
      alert(`Deleted ${result.deleted} member(s).${result.failed > 0 ? ` Failed: ${result.failed}` : ''}`);
      setSelectedIds(new Set());
      router.refresh();
    } else {
      alert("Error: " + result.error);
    }
  };

  return (
    <div>
      {/* Search and Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <div className="flex items-center gap-2">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
          >
            All ({members.length})
          </Button>
          <Button
            variant={statusFilter === "active" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("active")}
          >
            Active
          </Button>
          <Button
            variant={statusFilter === "paused" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("paused")}
            className={statusFilter === "paused" ? "" : pausedCount > 0 ? "border-orange-300 text-orange-600" : ""}
          >
            Paused {pausedCount > 0 && `(${pausedCount})`}
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant={accountFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setAccountFilter("all")}
          >
            All Accounts
          </Button>
          <Button
            variant={accountFilter === "with_account" ? "default" : "outline"}
            size="sm"
            onClick={() => setAccountFilter("with_account")}
          >
            With Account
          </Button>
          <Button
            variant={accountFilter === "without_account" ? "default" : "outline"}
            size="sm"
            onClick={() => setAccountFilter("without_account")}
            className={accountFilter === "without_account" ? "" : withoutAccountCount > 0 ? "border-red-300 text-red-600" : ""}
          >
            No Account {withoutAccountCount > 0 && `(${withoutAccountCount})`}
          </Button>
        </div>
        
        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} selected
            </span>
            <Button
              size="sm"
              onClick={handleBulkSendLogin}
              disabled={sendingLogin || deleting}
            >
              {sendingLogin ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Send Login Info
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={sendingLogin || deleting}
            >
              {deleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Delete
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={selectedIds.size === filteredMembers.length && filteredMembers.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.map((member) => (
              <TableRow 
                key={member.id} 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/admin/members/${member.id}`)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(member.id)}
                    onCheckedChange={() => toggleSelect(member.id)}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span>{member.first_name} {member.last_name}</span>
                    {!member.auth_user_id && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200" title="No account created">
                        <UserX className="w-3 h-3" />
                        No Account
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {member.email || "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {member.phone || "-"}
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={`font-semibold ${
                      Number(member.balance) < 10
                        ? "text-destructive"
                        : "text-foreground"
                    }`}
                  >
                    ₪{Number(member.balance).toFixed(2)}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      member.status === "active"
                        ? "bg-primary/10 text-primary"
                        : member.status === "paused"
                        ? "bg-orange-100 text-orange-700"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {member.status === "active" ? "Active" : member.status === "paused" ? "Paused" : "Inactive"}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMember(member);
                    }}
                  >
                    Adjust Balance
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {filteredMembers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {search ? "No members found matching your search" : "No members yet"}
          </div>
        )}
      </div>

      {/* Adjust Balance Dialog */}
      {selectedMember && (
        <AdjustBalanceDialog
          member={selectedMember}
          open={!!selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}
