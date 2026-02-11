"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import type { Member } from "@/lib/types";
import { Search, X } from "lucide-react";

interface OwnerSelectionDialogProps {
  businessId: string;
  businessName: string;
  currentOwnerId?: string;
  currentOwnerName?: string;
  onOwnerSelected: (member: Member | null) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function OwnerSelectionDialog({
  businessId,
  businessName,
  currentOwnerId,
  currentOwnerName,
  onOwnerSelected,
  isOpen,
  onClose,
}: OwnerSelectionDialogProps) {
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    loadMembers();
  }, [isOpen]);

  async function loadMembers() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("members")
      .select("*")
      .eq("is_active", true)
      .order("first_name");

    if (data) {
      setMembers(data);
      setFilteredMembers(data);
    }
    setLoading(false);
  }

  useEffect(() => {
    const searchLower = search.toLowerCase();
    const filtered = members.filter(
      (m) =>
        `${m.first_name} ${m.last_name}`.toLowerCase().includes(searchLower) ||
        m.email?.toLowerCase().includes(searchLower) ||
        m.member_code?.toLowerCase().includes(searchLower)
    );
    setFilteredMembers(filtered);
  }, [search, members]);

  async function handleSelectOwner(member: Member) {
    setSelectedMember(member);
    // Update business with owner_member_id
    const supabase = createClient();
    await supabase
      .from("businesses")
      .update({
        owner_member_id: member.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", businessId);

    onOwnerSelected(member);
    onClose();
  }

  async function handleRemoveOwner() {
    const supabase = createClient();
    await supabase
      .from("businesses")
      .update({
        owner_member_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", businessId);

    setSelectedMember(null);
    onOwnerSelected(null);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Set Business Owner</DialogTitle>
          <DialogDescription>
            Select a member as the owner for <strong>{businessName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {currentOwnerName && (
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-900">
                Current owner: <strong>{currentOwnerName}</strong>
              </p>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members by name, email, or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Loading members...
              </p>
            ) : filteredMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No active members found
              </p>
            ) : (
              filteredMembers.map((member) => (
                <Button
                  key={member.id}
                  variant={currentOwnerId === member.id ? "default" : "outline"}
                  className="w-full justify-start text-left"
                  onClick={() => handleSelectOwner(member)}
                >
                  <div className="flex flex-col gap-1 text-left">
                    <span className="font-medium">
                      {member.first_name} {member.last_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {member.email || member.member_code}
                    </span>
                  </div>
                </Button>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={handleRemoveOwner}
              className="flex-1"
            >
              <X className="w-4 h-4 mr-2" />
              Clear Owner
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
