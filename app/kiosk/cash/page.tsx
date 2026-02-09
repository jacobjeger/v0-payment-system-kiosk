"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  ArrowLeft, Search, User, CreditCard, Check, Banknote, 
  Calculator, X, ChevronRight, Building2, Receipt, KeyRound, Edit3, Users
} from "lucide-react";
import {
  getAllMembersForCashCollection,
  getMemberBillForCycle,
  recordCashPayment,
  getLastClosedBillingCycle,
  updateMemberPin,
} from "@/app/actions/cash-collection";

type CashStep = "search" | "bill" | "payment" | "success";

interface MemberResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  card_last_four: string | null;
  pin_code: string | null;
  is_active: boolean;
}

interface BillData {
  grandTotal: number;
  totalCashPaid: number;
  amountOwed: number;
  businessBreakdown: Array<{ name: string; total: number; transactions: number }>;
  transactionCount: number;
}

// Israeli currency denominations
const DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1];

export default function CashCollectionKiosk() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectorId = searchParams.get("collector");
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<CashStep>("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [allMembers, setAllMembers] = useState<MemberResult[]>([]);
  const [filteredMembers, setFilteredMembers] = useState<MemberResult[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberResult | null>(null);
  const [lastClosedCycle, setLastClosedCycle] = useState<{ id: string; name: string } | null>(null);
  const [billData, setBillData] = useState<BillData | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [isFullPayment, setIsFullPayment] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  
  // Change calculator
  const [showChangeCalc, setShowChangeCalc] = useState(false);
  const [amountReceived, setAmountReceived] = useState("");
  
  // PIN editing
  const [editingPin, setEditingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  useEffect(() => {
    if (!collectorId) {
      router.push("/kiosk");
      return;
    }
    loadInitialData();
  }, [collectorId, router]);

  async function loadInitialData() {
    setInitialLoading(true);
    
    const [cycleResult, membersResult] = await Promise.all([
      getLastClosedBillingCycle(),
      getAllMembersForCashCollection(),
    ]);
    
    if (cycleResult.success && cycleResult.data) {
      setLastClosedCycle({ id: cycleResult.data.id, name: cycleResult.data.name });
    }
    
    if (membersResult.success && membersResult.data) {
      setAllMembers(membersResult.data);
    }
    
    setInitialLoading(false);
  }

  // Filter members locally for instant search
  useEffect(() => {
    if (searchQuery.length < 1) {
      setFilteredMembers([]);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const filtered = allMembers.filter(member => 
      member.first_name.toLowerCase().includes(query) ||
      member.last_name.toLowerCase().includes(query) ||
      `${member.first_name} ${member.last_name}`.toLowerCase().includes(query) ||
      (member.email && member.email.toLowerCase().includes(query))
    ).slice(0, 15); // Limit to 15 results for performance
    setFilteredMembers(filtered);
  }, [searchQuery, allMembers]);

  async function selectMember(member: MemberResult) {
    if (!lastClosedCycle) return;
    setSelectedMember(member);
    setLoading(true);
    
    const result = await getMemberBillForCycle(member.id, lastClosedCycle.id);
    if (result.success && result.data) {
      setBillData(result.data);
      setStep("bill");
    }
    setLoading(false);
  }

  async function handlePayment(fullPayment: boolean) {
    if (!selectedMember || !lastClosedCycle || !collectorId || !billData) return;
    
    const amount = fullPayment ? billData.amountOwed : Number.parseFloat(paymentAmount);
    if (!amount || amount <= 0) return;
    
    setLoading(true);
    const result = await recordCashPayment({
      memberId: selectedMember.id,
      cycleId: lastClosedCycle.id,
      amount,
      collectorMemberId: collectorId,
      notes: fullPayment ? "Paid in full" : "Partial payment",
      isFullPayment: fullPayment,
    });
    
    if (result.success) {
      setIsFullPayment(fullPayment);
      setStep("success");
    }
    setLoading(false);
  }
  
  async function handleSavePin() {
    if (!selectedMember || newPin.length !== 4) return;
    
    setPinSaving(true);
    const result = await updateMemberPin(selectedMember.id, newPin);
    if (result.success) {
      // Update local state
      setSelectedMember({ ...selectedMember, pin_code: newPin });
      setAllMembers(prev => prev.map(m => m.id === selectedMember.id ? { ...m, pin_code: newPin } : m));
      setEditingPin(false);
      setNewPin("");
    }
    setPinSaving(false);
  }

  function calculateChange(received: number, owed: number): { change: number; breakdown: Array<{ denom: number; count: number }> } {
    const change = received - owed;
    if (change <= 0) return { change: 0, breakdown: [] };
    
    const breakdown: Array<{ denom: number; count: number }> = [];
    let remaining = change;
    
    for (const denom of DENOMINATIONS) {
      const count = Math.floor(remaining / denom);
      if (count > 0) {
        breakdown.push({ denom, count });
        remaining -= count * denom;
      }
    }
    
    return { change, breakdown };
  }

  function resetToSearch() {
    setStep("search");
    setSelectedMember(null);
    setBillData(null);
    setPaymentAmount("");
    setSearchQuery("");
    setFilteredMembers([]);
    setShowChangeCalc(false);
    setAmountReceived("");
    setEditingPin(false);
    setNewPin("");
    // Focus search input after reset
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }
  
  function handleNextPerson() {
    resetToSearch();
  }

  if (!collectorId) {
    return null;
  }

  const changeResult = amountReceived && billData 
    ? calculateChange(Number.parseFloat(amountReceived), billData.amountOwed)
    : { change: 0, breakdown: [] };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col">
      {/* Header - Fixed for tablet */}
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/kiosk")}
            className="w-10 h-10 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-stone-900">Cash Collection</h1>
            {lastClosedCycle && (
              <p className="text-sm text-stone-500">Collecting for: <span className="font-medium">{lastClosedCycle.name}</span></p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-right text-sm text-stone-500">
            <Users className="w-4 h-4 inline mr-1" />
            {allMembers.length} members
          </div>
          <Button
            variant="outline"
            onClick={() => setShowChangeCalc(!showChangeCalc)}
            className="gap-2 bg-transparent h-10"
          >
            <Calculator className="w-5 h-5" />
            <span className="hidden sm:inline">Calculator</span>
          </Button>
        </div>
      </header>

      {/* Main Content - Optimized for tablet landscape */}
      <main className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full">
        
        {/* Change Calculator Sidebar/Modal */}
        {showChangeCalc && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowChangeCalc(false)}>
            <Card className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Change Calculator</h3>
                  <button onClick={() => setShowChangeCalc(false)} className="text-stone-400 hover:text-stone-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="bg-stone-900 text-white rounded-xl p-4 text-center">
                  <p className="text-stone-400 text-sm">Amount Owed</p>
                  <p className="text-3xl font-bold">{"\u20AA"}{billData ? billData.amountOwed.toFixed(2) : "0.00"}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-stone-700 mb-2 block">Amount Received</label>
                  <Input
                    type="number"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    placeholder="0.00"
                    className="text-xl h-14 text-center font-semibold"
                    autoFocus
                  />
                </div>

                {/* Quick denomination buttons */}
                <div className="grid grid-cols-4 gap-2">
                  {[20, 50, 100, 200].map((amt) => (
                    <Button
                      key={amt}
                      variant="outline"
                      size="sm"
                      onClick={() => setAmountReceived(prev => (Number(prev || 0) + amt).toString())}
                      className="bg-transparent text-base"
                    >
                      +{amt}
                    </Button>
                  ))}
                </div>

                {Number(amountReceived) > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <p className="text-sm text-emerald-700 mb-1">Change to give:</p>
                    <p className="text-4xl font-bold text-emerald-700 mb-3">
                      {"\u20AA"}{changeResult.change.toFixed(2)}
                    </p>
                    
                    {changeResult.breakdown.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {changeResult.breakdown.map((item) => (
                          <span key={item.denom} className="bg-white border border-emerald-200 px-3 py-1.5 rounded-lg text-sm font-semibold">
                            {item.count} x {"\u20AA"}{item.denom}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                <Button variant="outline" onClick={() => setAmountReceived("")} className="w-full bg-transparent">
                  Clear
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search Step */}
        {step === "search" && (
          <div className="space-y-4">
            {initialLoading ? (
              <div className="text-center py-16 text-stone-500">
                <div className="w-10 h-10 border-3 border-stone-300 border-t-stone-600 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-lg">Loading members...</p>
              </div>
            ) : !lastClosedCycle ? (
              <div className="text-center py-16 text-stone-500">
                <Receipt className="w-16 h-16 mx-auto mb-4 text-stone-300" />
                <p className="text-xl font-medium">No closed billing cycle</p>
                <p className="text-base">Close a billing cycle first to collect cash payments</p>
              </div>
            ) : (
              <>
                {/* Large search input for tablet */}
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-stone-400" />
                  <Input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 h-16 text-xl rounded-2xl border-2 border-stone-200 focus:border-stone-400"
                    autoFocus
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery("")}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  )}
                </div>

                {/* Results grid - optimized for tablet */}
                {filteredMembers.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => selectMember(member)}
                        disabled={loading}
                        className="bg-white border-2 border-stone-200 rounded-2xl p-4 flex items-center gap-4 hover:border-emerald-400 hover:shadow-md transition-all text-left disabled:opacity-50"
                      >
                        <div className="w-14 h-14 rounded-full bg-stone-900 flex items-center justify-center flex-shrink-0">
                          <span className="text-lg font-bold text-white">
                            {member.first_name[0]}{member.last_name[0]}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-lg text-stone-900 truncate">
                            {member.first_name} {member.last_name}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            {member.card_last_four && (
                              <span className="flex items-center gap-1 text-xs text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
                                <CreditCard className="w-3 h-3" />
                                {member.card_last_four}
                              </span>
                            )}
                            {member.pin_code && (
                              <span className="flex items-center gap-1 text-xs text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">
                                <KeyRound className="w-3 h-3" />
                                {member.pin_code}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-6 h-6 text-stone-400 flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.length >= 1 && filteredMembers.length === 0 && !loading && (
                  <div className="text-center py-16 text-stone-500">
                    <User className="w-16 h-16 mx-auto mb-4 text-stone-300" />
                    <p className="text-xl">No members found</p>
                  </div>
                )}

                {searchQuery.length < 1 && (
                  <div className="text-center py-16 text-stone-400">
                    <Search className="w-16 h-16 mx-auto mb-4 text-stone-300" />
                    <p className="text-xl">Start typing to search</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Bill Step - Two column layout for tablet */}
        {step === "bill" && selectedMember && billData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Member Info & Breakdown */}
            <div className="space-y-4">
              {/* Member Card with PIN */}
              <Card className="overflow-hidden">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full bg-stone-900 flex items-center justify-center">
                        <span className="text-2xl font-bold text-white">
                          {selectedMember.first_name[0]}{selectedMember.last_name[0]}
                        </span>
                      </div>
                      <div>
                        <p className="font-bold text-xl text-stone-900">
                          {selectedMember.first_name} {selectedMember.last_name}
                        </p>
                        {selectedMember.email && (
                          <p className="text-sm text-stone-500">{selectedMember.email}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Card & PIN Info */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-stone-50 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-stone-500 text-sm mb-1">
                        <CreditCard className="w-4 h-4" />
                        <span>Card</span>
                      </div>
                      <p className="font-mono font-semibold text-lg">
                        {selectedMember.card_last_four ? `**** ${selectedMember.card_last_four}` : "No card"}
                      </p>
                    </div>
                    
                    <div className="bg-stone-50 rounded-xl p-3">
                      <div className="flex items-center justify-between text-stone-500 text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <KeyRound className="w-4 h-4" />
                          <span>PIN</span>
                        </div>
                        <button 
                          onClick={() => { setEditingPin(true); setNewPin(selectedMember.pin_code || ""); }}
                          className="text-emerald-600 hover:text-emerald-700"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                      {editingPin ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="text"
                            maxLength={4}
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                            className="h-8 w-20 text-center font-mono font-semibold"
                            autoFocus
                          />
                          <Button size="sm" onClick={handleSavePin} disabled={newPin.length !== 4 || pinSaving} className="h-8 px-2">
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingPin(false)} className="h-8 px-2">
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className="font-mono font-semibold text-lg">
                          {selectedMember.pin_code || "Not set"}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Business Breakdown */}
              {billData.businessBreakdown.length > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-stone-500 text-sm mb-3">
                      <Building2 className="w-4 h-4" />
                      <span>Spending by Business</span>
                    </div>
                    <div className="space-y-2">
                      {billData.businessBreakdown.map((biz) => (
                        <div key={biz.name} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0">
                          <div>
                            <p className="font-medium text-stone-900">{biz.name}</p>
                            <p className="text-xs text-stone-500">{biz.transactions} transactions</p>
                          </div>
                          <p className="font-bold text-stone-900">{"\u20AA"}{biz.total.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column - Payment Actions */}
            <div className="space-y-4">
              {/* Amount Owed Card */}
              <Card className="bg-stone-900 text-white overflow-hidden">
                <CardContent className="p-6 text-center">
                  <p className="text-stone-400 text-sm mb-1">{lastClosedCycle?.name}</p>
                  <p className="text-5xl font-bold mb-2">
                    {"\u20AA"}{billData.amountOwed.toFixed(2)}
                  </p>
                  <p className="text-stone-400 text-sm">
                    {billData.transactionCount} transactions | Total: {"\u20AA"}{billData.grandTotal.toFixed(2)}
                    {billData.totalCashPaid > 0 && (
                      <span className="text-emerald-400"> | Paid: {"\u20AA"}{billData.totalCashPaid.toFixed(2)}</span>
                    )}
                  </p>
                </CardContent>
              </Card>

              {/* Payment Actions */}
              {billData.amountOwed > 0 ? (
                <div className="space-y-3">
                  <Button
                    onClick={() => handlePayment(true)}
                    disabled={loading}
                    className="w-full h-16 text-xl bg-emerald-600 hover:bg-emerald-700 rounded-2xl"
                  >
                    <Banknote className="w-6 h-6 mr-3" />
                    Paid Full {"\u20AA"}{billData.amountOwed.toFixed(2)}
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => setStep("payment")}
                    className="w-full h-14 text-lg bg-transparent rounded-2xl"
                  >
                    <Receipt className="w-5 h-5 mr-2" />
                    Partial Payment
                  </Button>
                  
                  <Button
                    variant="ghost"
                    onClick={() => setShowChangeCalc(true)}
                    className="w-full h-12 text-stone-600"
                  >
                    <Calculator className="w-5 h-5 mr-2" />
                    Calculate Change
                  </Button>
                </div>
              ) : (
                <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-8 text-center">
                  <Check className="w-16 h-16 mx-auto mb-4 text-emerald-600" />
                  <p className="text-2xl font-bold text-emerald-700">Fully Paid</p>
                  <p className="text-emerald-600 mt-1">No outstanding balance</p>
                </div>
              )}
              
              {/* Quick Nav */}
              <Button
                variant="ghost"
                onClick={resetToSearch}
                className="w-full h-12 text-stone-600"
              >
                <ArrowLeft className="w-5 h-5 mr-2" />
                Back to Search
              </Button>
            </div>
          </div>
        )}

        {/* Partial Payment Step */}
        {step === "payment" && selectedMember && billData && (
          <div className="max-w-md mx-auto space-y-4">
            <button
              onClick={() => setStep("bill")}
              className="flex items-center gap-2 text-stone-500 hover:text-stone-700 text-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to bill
            </button>

            <Card className="bg-stone-900 text-white">
              <CardContent className="p-6 text-center">
                <p className="text-stone-400 text-sm">Amount Owed</p>
                <p className="text-4xl font-bold">{"\u20AA"}{billData.amountOwed.toFixed(2)}</p>
              </CardContent>
            </Card>

            <div>
              <label className="text-sm font-medium text-stone-700 mb-2 block">Payment Amount</label>
              <Input
                type="number"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter amount"
                className="h-16 text-2xl text-center rounded-2xl"
                autoFocus
              />
            </div>

            <Button
              onClick={() => handlePayment(false)}
              disabled={!paymentAmount || Number.parseFloat(paymentAmount) <= 0 || loading}
              className="w-full h-16 text-xl bg-emerald-600 hover:bg-emerald-700 rounded-2xl"
            >
              <Banknote className="w-6 h-6 mr-3" />
              Record Payment
            </Button>
          </div>
        )}

        {/* Success Step - Auto reset */}
        {step === "success" && selectedMember && (
          <div className="max-w-md mx-auto text-center py-8">
            <div className="w-24 h-24 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6">
              <Check className="w-12 h-12 text-emerald-600" />
            </div>
            
            <h2 className="text-3xl font-bold text-stone-900 mb-2">Payment Recorded</h2>
            <p className="text-stone-500 text-lg mb-8">
              {isFullPayment ? "Full payment" : "Partial payment"} from {selectedMember.first_name} {selectedMember.last_name}
            </p>
            
            <Button
              onClick={handleNextPerson}
              className="w-full h-16 text-xl bg-emerald-600 hover:bg-emerald-700 rounded-2xl"
              autoFocus
            >
              <Users className="w-6 h-6 mr-3" />
              Next Person
            </Button>
            
            <Button
              variant="ghost"
              onClick={() => router.push("/kiosk")}
              className="w-full h-12 mt-3 text-stone-600"
            >
              Exit Cash Collection
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
