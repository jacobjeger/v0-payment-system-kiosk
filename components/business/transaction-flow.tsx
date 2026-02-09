"use client";

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, ArrowLeft, CheckCircle2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Member, Business } from "@/lib/types";

interface TransactionFlowProps {
  business: Business;
  onSuccess?: () => void;
  onCancel?: () => void;
}

type Step = "member" | "amount" | "confirmation" | "success";

export function TransactionFlow({ business, onSuccess, onCancel }: TransactionFlowProps) {
  const [step, setStep] = useState<Step>("member");
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredMembers = useMemo(() => {
    if (!search) return members;
    return members.filter(m =>
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase())
    );
  }, [search, members]);

  const loadMembers = useCallback(async () => {
    if (members.length > 0) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("members")
      .select("*")
      .eq("is_active", true)
      .eq("approval_status", "approved")
      .order("first_name");
    setMembers(data || []);
    setLoading(false);
  }, [members.length]);

  const handleSelectMember = (member: Member) => {
    setSelectedMember(member);
    setStep("amount");
    setSearchOpen(false);
  };

  const handleAmountSubmit = async () => {
    if (!selectedMember || !amount) return;
    
    setLoading(true);
    try {
      const response = await fetch("/api/business/add-transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessId: business.id,
          memberId: selectedMember.id,
          amount: parseFloat(amount),
          description: description || `Payment by ${business.name}`,
          metadata: { source: "business_portal", businessName: business.name },
        }),
      });

      const result = await response.json();

      if (result.success) {
        setStep("success");
        setTimeout(() => {
          setStep("member");
          setSelectedMember(null);
          setAmount("");
          setDescription("");
          onSuccess?.();
        }, 2000);
      } else {
        console.error("[v0] Transaction error:", result.error);
      }
    } catch (error) {
      console.error("[v0] API call error:", error);
    }
    setLoading(false);
  };

  const handleReset = () => {
    setStep("member");
    setSelectedMember(null);
    setAmount("");
    setDescription("");
    setSearch("");
  };

  if (step === "member") {
    return (
      <div className="w-full max-w-lg mx-auto">
        <div className="space-y-4">
          <h2 className="text-2xl font-bold text-zinc-900">Add Transaction</h2>
          
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-start text-left font-normal bg-transparent"
                onClick={() => {
                  setSearchOpen(true);
                  loadMembers();
                }}
              >
                <Search className="w-4 h-4 mr-2" />
                {selectedMember ? `${selectedMember.first_name} ${selectedMember.last_name}` : "Search member..."}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput 
                  placeholder="Search members..." 
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  <CommandEmpty>
                    {loading ? "Loading..." : "No members found"}
                  </CommandEmpty>
                  <CommandGroup>
                    {filteredMembers.map((member) => (
                      <CommandItem
                        key={member.id}
                        value={`${member.first_name} ${member.last_name}`}
                        onSelect={() => handleSelectMember(member)}
                      >
                        <div className="flex items-center gap-3 w-full">
                          <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-semibold">
                            {member.first_name.charAt(0)}{member.last_name.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium">{member.first_name} {member.last_name}</p>
                            <p className="text-xs text-zinc-500">{member.email}</p>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Button variant="outline" onClick={onCancel} className="w-full bg-transparent">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (step === "amount") {
    return (
      <div className="w-full max-w-lg mx-auto">
        <div className="space-y-6">
          <button 
            onClick={() => setStep("member")}
            className="flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div>
            <h2 className="text-2xl font-bold text-zinc-900">
              {selectedMember?.first_name} {selectedMember?.last_name}
            </h2>
            <p className="text-sm text-zinc-500">Balance: ₪{selectedMember?.balance || 0}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Amount (₪)</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="text-lg"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Description (optional)</label>
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a note..."
            />
          </div>

          <div className="space-y-2">
            <Button 
              onClick={handleAmountSubmit} 
              disabled={!amount || loading}
              className="w-full"
            >
              {loading ? "Processing..." : "Confirm"}
            </Button>
            <Button variant="outline" onClick={handleReset} className="w-full bg-transparent">
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="w-full max-w-lg mx-auto flex items-center justify-center min-h-64">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle2 className="w-16 h-16 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-900">Transaction Added</h2>
            <p className="text-sm text-zinc-600">₪{parseFloat(amount).toFixed(2)} added for {selectedMember?.first_name}</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
