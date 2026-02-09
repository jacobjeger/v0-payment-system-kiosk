"use client";

import React from "react"

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { businessAddTransaction } from "@/app/actions/business-add-transaction";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface AddTransactionDialogProps {
  businessId: string;
  onSuccess?: () => void;
}

export function AddTransactionDialog({ businessId, onSuccess }: AddTransactionDialogProps) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      loadMembers();
    }
  }, [open]);

  async function loadMembers() {
    setMembersLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("members")
      .select("id, first_name, last_name, email")
      .eq("is_active", true)
      .eq("approval_status", "approved")
      .order("first_name");
    
    setMembers(data || []);
    setMembersLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (!selectedMemberId || !amount) {
      alert("Please fill in all required fields");
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("Please enter a valid amount");
      return;
    }

    setLoading(true);

    const result = await businessAddTransaction({
      businessId,
      memberId: selectedMemberId,
      amount: amountNum,
      description: description.trim() || undefined,
    });

    if (result.success) {
      setOpen(false);
      setSelectedMemberId("");
      setAmount("");
      setDescription("");
      if (onSuccess) onSuccess();
    } else {
      alert("Error: " + result.error);
    }

    setLoading(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Transaction
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
            <DialogDescription>
              Manually add a transaction for a member
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="member">Member *</Label>
              {membersLoading ? (
                <div className="text-sm text-muted-foreground">Loading members...</div>
              ) : (
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={searchOpen}
                      className="w-full justify-between"
                    >
                      {selectedMemberId
                        ? (() => {
                            const member = members.find((m) => m.id === selectedMemberId);
                            return member ? `${member.first_name} ${member.last_name} (${member.email})` : "Select a member";
                          })()
                        : "Select a member"}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search members by name or email..." />
                      <CommandList>
                        <CommandEmpty>No member found.</CommandEmpty>
                        <CommandGroup>
                          {members.map((member) => (
                            <CommandItem
                              key={member.id}
                              value={`${member.first_name} ${member.last_name} ${member.email}`}
                              onSelect={() => {
                                setSelectedMemberId(member.id);
                                setSearchOpen(false);
                              }}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {member.first_name} {member.last_name}
                                </span>
                                <span className="text-xs text-muted-foreground">{member.email}</span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
              {selectedMemberId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => setSelectedMemberId("")}
                >
                  <X className="w-3 h-3 mr-1" />
                  Clear selection
                </Button>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (₪) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                placeholder="Enter transaction description..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
