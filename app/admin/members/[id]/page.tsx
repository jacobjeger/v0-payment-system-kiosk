"use client";

import { Switch } from "@/components/ui/switch"

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Receipt, TrendingUp, CreditCard, User, Pause, Play, Trash2, Mail, Save, X, Key, Link2, Copy, Check, UserPlus, MessageSquare, Loader2, Filter, ChevronDown, Calendar, AlertTriangle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { TransactionTable } from "@/components/admin/transaction-table";
import { AddTransactionDialog } from "@/components/admin/add-transaction-dialog";
import { updateMember, pauseMember, activateMember, deleteMember, createMemberAccount, sendMemberMagicLink, sendMemberPasswordReset, generateMemberTempPassword, getMemberWithDecryptedCard, updateMemberKioskMessage } from "@/app/actions/admin";
import { markCardAsDeclined, sendCardDeclineNotification } from "@/app/actions/member";
import type { Member, Business, Transaction } from "@/lib/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";


export default function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [memberId, setMemberId] = useState<string>("");
  const [thisMonthTotal, setThisMonthTotal] = useState<number>(0); // Declare thisMonthTotal
  
  // Account management state
  const [accountAction, setAccountAction] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [kioskMessage, setKioskMessage] = useState("");
  const [editingKioskMessage, setEditingKioskMessage] = useState(false);
  const [savingKioskMessage, setSavingKioskMessage] = useState(false);
  
  // Cycle filtering
  const [cycles, setCycles] = useState<Array<{ id: string; name: string; status: string; start_date: string; end_date: string }>>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"cycle" | "1m" | "3m" | "6m" | "1y" | "all">("all");

  // Card decline dialog state
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [declineMessage, setDeclineMessage] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    pinCode: "",
    cardNumber: "",
    cardCvc: "",
    cardExpMonth: "",
    cardExpYear: "",
    cardZip: "",
    skipPin: false,
  });

  useEffect(() => {
    async function load() {
      const { id } = await params;
      setMemberId(id);
      
      const supabase = createClient();
      
      const [memberRes, txRes, bizRes, cyclesRes, activeCycleRes] = await Promise.all([
        supabase.from("members").select("*").eq("id", id).single(),
        supabase
          .from("transactions")
          .select(`*, businesses ( id, name )`)
          .eq("member_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("businesses")
          .select("id, name")
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("name"),
        supabase.from("billing_cycles").select("*").order("created_at", { ascending: false }),
        supabase.from("billing_cycles").select("*").eq("status", "active").single(),
      ]);
      
      setCycles(cyclesRes.data || []);
      if (activeCycleRes.data) {
        setSelectedCycleId(activeCycleRes.data.id);
        setFilterType("cycle");
      }

      if (memberRes.data) {
        // Get member with decrypted card data from server
        const decryptedResult = await getMemberWithDecryptedCard(memberRes.data.id);
        const memberData = decryptedResult.success && decryptedResult.member ? decryptedResult.member : memberRes.data;
        
        setMember(memberData);
        setFormData({
          firstName: memberData.first_name || "",
          lastName: memberData.last_name || "",
          email: memberData.email || "",
          phone: memberData.phone || "",
          pinCode: memberData.pin_code || "",
          cardNumber: memberData.card_number || "",
          cardCvc: memberData.card_cvc || "",
          cardExpMonth: memberData.card_exp_month || "",
          cardExpYear: memberData.card_exp_year || "",
          cardZip: memberData.card_zip || "",
          skipPin: memberData.skip_pin || false,
        });
        setKioskMessage(memberData.kiosk_message || "");
      }
      setTransactions(txRes.data || []);
      setBusinesses(bizRes.data || []);
      setLoading(false);

      // Calculate thisMonthTotal
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      const currentMonthTransactions = txRes.data.filter(tx => {
        const txDate = new Date(tx.created_at);
        return txDate >= startDate;
      });
      setThisMonthTotal(currentMonthTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0));
    }
    load();
  }, [params]);

  const handleSave = async () => {
    if (!member) return;
    setSaving(true);
    
    await updateMember(member.id, {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email || undefined,
      phone: formData.phone || undefined,
      pinCode: formData.pinCode || undefined,
      cardNumber: formData.cardNumber || undefined,
      cardCvc: formData.cardCvc || undefined,
      cardExpMonth: formData.cardExpMonth || undefined,
      cardExpYear: formData.cardExpYear || undefined,
      cardZip: formData.cardZip || undefined,
      skipPin: formData.skipPin,
    });

    setMember({
      ...member,
      first_name: formData.firstName,
      last_name: formData.lastName,
      email: formData.email || null,
      phone: formData.phone || null,
      pin_code: formData.pinCode || null,
      card_number: formData.cardNumber || null,
      card_cvc: formData.cardCvc || null,
      card_exp_month: formData.cardExpMonth || null,
      card_exp_year: formData.cardExpYear || null,
      card_zip: formData.cardZip || null,
      skip_pin: formData.skipPin,
    });

    setSaving(false);
    setEditing(false);
  };

  const handlePause = async () => {
    if (!member) return;
    await pauseMember(member.id, pauseReason);
    setMember({ ...member, status: 'paused', pause_reason: pauseReason });
    setShowPauseDialog(false);
    setPauseReason("");
  };

  const handleActivate = async () => {
    if (!member) return;
    await activateMember(member.id);
    setMember({ ...member, status: 'active', pause_reason: null });
  };

  const handleDelete = async () => {
    if (!member) return;
    await deleteMember(member.id);
    router.push("/admin/members");
  };

  const handleMarkCardDeclined = async () => {
    if (!member) return;
    
    setSaving(true);
    
    // First mark the card as declined
    const declineResult = await markCardAsDeclined(member.id);
    
    if (!declineResult.success) {
      alert("Error marking card as declined: " + (declineResult.error || "Unknown error"));
      setSaving(false);
      return;
    }

    // Then send the notification message with default values
    const messageResult = await sendCardDeclineNotification({
      memberId: member.id,
      billingCycle: "the most recent",
      adminName: "Yaakov Koegel",
      adminPhone: "Call/text Tzachi at 845-573-1405",
    });

    if (messageResult.success) {
      setDeclineMessage(messageResult.message);
      setMember({ ...member, card_status: "declined" });
      
      // Close dialog after 2 seconds
      setTimeout(() => {
        setShowDeclineDialog(false);
        setDeclineMessage(null);
      }, 2000);
    } else {
      alert("Error sending notification: " + ((messageResult as any)?.error || "Unknown error"));
    }
    
    setSaving(false);
  };

  const handleCreateAccount = async () => {
    if (!member || !member.email) {
      alert("Please save an email address first");
      return;
    }
    setAccountAction("creating");
    const result = await createMemberAccount(member.id, member.email);
    if (result.success) {
      setMember({ ...member, auth_user_id: "set" });
      alert("Account created! Welcome email sent to " + member.email);
    } else {
      alert("Error: " + result.error);
    }
    setAccountAction(null);
  };

  const handleSendMagicLink = async () => {
    if (!member || !member.email) return;
    setAccountAction("magic");
    const result = await sendMemberMagicLink(member.id, member.email);
    if (result.success) {
      alert("Magic link sent to " + member.email);
    } else {
      alert("Error: " + result.error);
    }
    setAccountAction(null);
  };

  const handleSendPasswordReset = async () => {
    if (!member || !member.email) return;
    setAccountAction("reset");
    const result = await sendMemberPasswordReset(member.id, member.email);
    if (result.success) {
      alert("Password reset link sent to " + member.email);
    } else {
      alert("Error: " + result.error);
    }
    setAccountAction(null);
  };

  const handleGenerateTempPassword = async () => {
    if (!member || !member.email) return;
    setAccountAction("temp");
    const result = await generateMemberTempPassword(member.id, member.email);
    if (result.success && result.tempPassword) {
      setTempPassword(result.tempPassword);
    } else {
      alert("Error: " + result.error);
    }
    setAccountAction(null);
  };

  const copyTempPassword = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendLogin = async () => {
    if (!member || !member.email) return;
    setAccountAction("login");
    const result = await sendMemberMagicLink(member.id, member.email);
    if (result.success) {
      alert("Login link sent to " + member.email);
    } else {
      alert("Error: " + result.error);
    }
    setAccountAction(null);
  };

  const handleSaveKioskMessage = async () => {
    if (!member) return;
    setSavingKioskMessage(true);
    const result = await updateMemberKioskMessage(member.id, kioskMessage || null);
    if (result.success) {
      setEditingKioskMessage(false);
    } else {
      alert("Error: " + result.error);
    }
    setSavingKioskMessage(false);
  };

  const handleClearKioskMessage = async () => {
    if (!member) return;
    setSavingKioskMessage(true);
    const result = await updateMemberKioskMessage(member.id, null);
    if (result.success) {
      setKioskMessage("");
      setEditingKioskMessage(false);
    }
    setSavingKioskMessage(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="max-w-6xl mx-auto">
        <p className="text-center text-muted-foreground py-12">Member not found</p>
      </div>
    );
  }

  // Calculate stats based on filter
  const getFilteredTransactions = () => {
    if (filterType === "cycle" && selectedCycleId) {
      // Filter by billing_cycle_id for accurate results
      return transactions.filter(tx => tx.billing_cycle_id === selectedCycleId);
    } else if (filterType !== "all") {
      const now = new Date();
      let startDate: Date;
      switch (filterType) {
        case "1m": startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()); break;
        case "3m": startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate()); break;
        case "6m": startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()); break;
        case "1y": startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
        default: startDate = new Date(0);
      }
      return transactions.filter(tx => new Date(tx.created_at) >= startDate);
    }
    return transactions;
  };

  const filteredTransactions = getFilteredTransactions();
  const periodTotal = filteredTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const totalSpent = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  
  // Calculate current balance based on filter
  // For cycle filter, show the cycle-specific balance
  // For other filters, show the member's actual balance
  const displayBalance = filterType === "cycle" && selectedCycleId 
    ? periodTotal  // For cycle filter, balance is the sum of transactions in that cycle
    : member.balance; // For other filters, show actual member balance

  const getFilterLabel = () => {
    if (filterType === "cycle" && selectedCycleId) {
      const cycle = cycles.find(c => c.id === selectedCycleId);
      return cycle?.name || "Selected Cycle";
    }
    switch (filterType) {
      case "1m": return "Last Month";
      case "3m": return "Last 3 Months";
      case "6m": return "Last 6 Months";
      case "1y": return "Last Year";
      default: return "All Time";
    }
  };

  const handleFilterChange = (filter: typeof filterType, cycleId?: string) => {
    setFilterType(filter);
    setSelectedCycleId(cycleId || null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link href="/admin/members">
          <Button variant="ghost" size="sm" className="mb-4 gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Members
          </Button>
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">
                {member.first_name} {member.last_name}
              </h1>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                member.status === 'active'
                  ? "bg-primary/10 text-primary"
                  : member.status === 'paused'
                  ? "bg-orange-100 text-orange-700"
                  : "bg-red-100 text-red-700"
              }`}>
                {member.status === 'active' ? 'Active' : member.status === 'paused' ? 'Paused' : 'Deleted'}
              </span>
            </div>
            {member.status === 'paused' && member.pause_reason && (
              <p className="text-orange-600 text-sm mt-1">
                Pause Reason: {member.pause_reason}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {member.status === 'active' ? (
              <Button variant="outline" onClick={() => setShowPauseDialog(true)} className="gap-2">
                <Pause className="w-4 h-4" />
                Pause Account
              </Button>
            ) : member.status === 'paused' ? (
              <Button variant="outline" onClick={handleActivate} className="gap-2 bg-transparent">
                <Play className="w-4 h-4" />
                Activate Account
              </Button>
            ) : null}
            <Button variant="destructive" onClick={() => setShowDeleteDialog(true)} className="gap-2">
              <Trash2 className="w-4 h-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Period Filter */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Statistics</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="bg-transparent">
              <Filter className="w-4 h-4 mr-2" />
              {getFilterLabel()}
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => handleFilterChange("all")}>
              <Calendar className="w-4 h-4 mr-2" />
              All Time
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleFilterChange("1m")}>
              <Calendar className="w-4 h-4 mr-2" />
              Last Month
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleFilterChange("3m")}>
              <Calendar className="w-4 h-4 mr-2" />
              Last 3 Months
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleFilterChange("6m")}>
              <Calendar className="w-4 h-4 mr-2" />
              Last 6 Months
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleFilterChange("1y")}>
              <Calendar className="w-4 h-4 mr-2" />
              Last Year
            </DropdownMenuItem>
            
            {cycles.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-xs text-muted-foreground font-medium">Billing Cycles</p>
                {cycles.map(cycle => (
                  <DropdownMenuItem 
                    key={cycle.id}
                    onClick={() => handleFilterChange("cycle", cycle.id)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <span className={`w-2 h-2 rounded-full ${
                        cycle.status === "active" ? "bg-green-500" : 
                        cycle.status === "closed" ? "bg-amber-500" : "bg-muted"
                      }`} />
                      <span className="flex-1">{cycle.name}</span>
                      {cycle.status === "active" && (
                        <span className="text-xs text-primary">Current</span>
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-xl">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  {filterType === "cycle" && selectedCycleId ? "Cycle Balance" : "Current Balance (Owed)"}
                </p>
                <p className={`text-2xl font-bold ${Number(displayBalance) > 0 ? "text-orange-600" : "text-foreground"}`}>
                  ₪{Number(displayBalance).toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="bg-orange-50 p-3 rounded-xl">
                <Receipt className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{getFilterLabel()}</p>
                <p className="text-2xl font-bold text-foreground">₪{periodTotal.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">{filteredTransactions.length} transactions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="bg-muted p-3 rounded-xl">
                <Receipt className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total All Time</p>
                <p className="text-2xl font-bold text-foreground">₪{totalSpent.toFixed(2)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profile Card */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile Information
          </CardTitle>
          {!editing ? (
            <Button variant="outline" onClick={() => setEditing(true)}>Edit Profile</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  {editing ? (
                    <Input
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    />
                  ) : (
                    <p className="font-medium">{member.first_name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  {editing ? (
                    <Input
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    />
                  ) : (
                    <p className="font-medium">{member.last_name}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                {editing ? (
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                ) : (
                  <p className="font-medium">{member.email || "-"}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                {editing ? (
                  <Input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                ) : (
                  <p className="font-medium">{member.phone || "-"}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>PIN Code (4 digits)</Label>
                {editing ? (
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={formData.pinCode}
                    onChange={(e) => setFormData({ ...formData, pinCode: e.target.value.replace(/\D/g, "") })}
                    placeholder="4 digit PIN"
                  />
                ) : (
                  <p className="font-medium font-mono">{member.pin_code || "-"}</p>
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <Label className="text-sm font-medium">Skip PIN at Kiosk</Label>
                  <p className="text-xs text-muted-foreground">Allow this member to make purchases without entering their PIN</p>
                </div>
                <Switch
                  checked={formData.skipPin}
                  onCheckedChange={async (checked) => {
                    setFormData({ ...formData, skipPin: checked });
                    // Auto-save skip PIN setting immediately
                    if (!editing) {
                      await updateMember(member.id, { skipPin: checked });
                      setMember({ ...member, skip_pin: checked });
                    }
                  }}
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div>
                  <Label className="text-sm font-medium text-amber-900">Cash Collector</Label>
                  <p className="text-xs text-amber-700">Allow this member to collect cash payments from others at the kiosk</p>
                </div>
                <Switch
                  checked={member.is_cash_collector || false}
                  onCheckedChange={async (checked) => {
                    await updateMember(member.id, { is_cash_collector: checked });
                    setMember({ ...member, is_cash_collector: checked });
                  }}
                />
              </div>
              {member.is_cash_collector && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <Label className="text-sm font-medium text-amber-900">Cash Collection Access PIN</Label>
                  <p className="text-xs text-amber-700 mb-2">Separate PIN required to access cash collection kiosk (4 digits)</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={member.cash_collector_pin || ""}
                      onChange={async (e) => {
                        const pin = e.target.value.replace(/\D/g, "");
                        setMember({ ...member, cash_collector_pin: pin });
                      }}
                      onBlur={async (e) => {
                        const pin = e.target.value;
                        if (pin.length === 4 || pin.length === 0) {
                          await updateMember(member.id, { cash_collector_pin: pin || undefined });
                        }
                      }}
                      placeholder="1234"
                      className="w-24 text-center font-mono text-lg"
                    />
                    <span className="text-xs text-amber-600">
                      {member.cash_collector_pin ? "PIN set" : "No PIN set"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-5 h-5 text-muted-foreground" />
                <Label className="text-base">Payment Information</Label>
              </div>
              <div className="space-y-2">
                <Label>Card Number</Label>
                {editing ? (
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={16}
                    value={formData.cardNumber}
                    onChange={(e) => setFormData({ ...formData, cardNumber: e.target.value.replace(/\D/g, "") })}
                    placeholder="1234567890123456"
                  />
                ) : (
                  <p className="font-medium font-mono">{member.card_number || "-"}</p>
                )}
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>CVC</Label>
                  {editing ? (
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={formData.cardCvc}
                      onChange={(e) => setFormData({ ...formData, cardCvc: e.target.value.replace(/\D/g, "") })}
                      placeholder="123"
                    />
                  ) : (
                    <p className="font-medium">{member.card_cvc || "-"}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Exp Month</Label>
                  {editing ? (
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={formData.cardExpMonth}
                      onChange={(e) => setFormData({ ...formData, cardExpMonth: e.target.value.replace(/\D/g, "") })}
                      placeholder="MM"
                    />
                  ) : (
                    <p className="font-medium">{member.card_exp_month || "-"}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Exp Year</Label>
                  {editing ? (
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={2}
                      value={formData.cardExpYear}
                      onChange={(e) => setFormData({ ...formData, cardExpYear: e.target.value.replace(/\D/g, "") })}
                      placeholder="YY"
                    />
                  ) : (
                    <p className="font-medium">{member.card_exp_year || "-"}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>ZIP Code</Label>
                  {editing ? (
                    <Input
                      type="text"
                      inputMode="numeric"
                      maxLength={5}
                      value={formData.cardZip}
                      onChange={(e) => setFormData({ ...formData, cardZip: e.target.value.replace(/\D/g, "") })}
                      placeholder="12345"
                    />
                  ) : (
                    <p className="font-medium">{member.card_zip || "-"}</p>
                  )}
                </div>
              </div>
  {/* Account Management Section */}
  <div className="space-y-2 pt-4 border-t">
  <Label className="flex items-center gap-2">
  <Key className="w-4 h-4" />
  Account Access & Payments
  </Label>
  
  {member.card_status !== "declined" && (
    <Button
      onClick={() => setShowDeclineDialog(true)}
      variant="outline"
      className="w-full bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
    >
      <AlertTriangle className="w-4 h-4 mr-2" />
      Mark Card as Declined
    </Button>
  )}
                
                {!member.auth_user_id ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">No account created yet</p>
                    {member.email && (
                      <>
                        <Button
                          onClick={handleCreateAccount}
                          disabled={accountAction === "creating"}
                          className="w-full bg-transparent"
                          variant="outline"
                        >
                          <UserPlus className="w-4 h-4 mr-2" />
                          {accountAction === "creating" ? "Creating..." : "Create Account"}
                        </Button>
                        <p className="text-xs text-muted-foreground">Create account first, then send login info separately</p>
                      </>
                    )}
                    {!member.email && (
                      <p className="text-xs text-orange-600">Add an email address to create account</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-primary/5 rounded-lg">
                      <p className="text-sm text-primary font-medium">Account active</p>
                      <p className="text-xs text-muted-foreground mt-1">Login: /member/login</p>
                    </div>
                    
                    {tempPassword && (
                      <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                        <p className="text-sm font-medium text-orange-800 mb-2">Temporary Password</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-white px-3 py-2 rounded border font-mono text-lg tracking-wider">
                            {tempPassword}
                          </code>
                          <Button variant="outline" size="sm" onClick={copyTempPassword}>
                            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                          </Button>
                        </div>
                        <p className="text-xs text-orange-600 mt-2">
                          User will be prompted to change this on first login
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleSendMagicLink}
                        disabled={!!accountAction}
                      >
                        <Link2 className="w-4 h-4 mr-2" />
                        {accountAction === "magic" ? "Sending..." : "Send Login Link"}
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleSendPasswordReset}
                        disabled={!!accountAction}
                      >
                        <Mail className="w-4 h-4 mr-2" />
                        {accountAction === "reset" ? "Sending..." : "Reset Password"}
                      </Button>
                    </div>
                    <Button 
                      variant="secondary" 
                      size="sm"
                      className="w-full"
                      onClick={handleGenerateTempPassword}
                      disabled={!!accountAction}
                    >
                      <Key className="w-4 h-4 mr-2" />
                      {accountAction === "temp" ? "Generating..." : "Generate Temporary Password"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{getFilterLabel()} Transactions</CardTitle>
          <AddTransactionDialog memberId={member.id} businesses={businesses} />
        </CardHeader>
        <CardContent>
          <TransactionTable transactions={filteredTransactions} memberId={member.id} businesses={businesses} />
        </CardContent>
      </Card>

      {/* Kiosk Message Card */}
      <Card className="mt-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Kiosk Login Message
          </CardTitle>
          {!editingKioskMessage ? (
            <Button variant="outline" size="sm" onClick={() => setEditingKioskMessage(true)}>
              {kioskMessage ? "Edit" : "Add Message"}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setEditingKioskMessage(false);
                  setKioskMessage(member.kiosk_message || "");
                }}
                disabled={savingKioskMessage}
              >
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveKioskMessage} disabled={savingKioskMessage}>
                {savingKioskMessage ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Save
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            This message will be shown to the member when they log in at the kiosk. Use this for important notices or reminders.
          </p>
          
          {editingKioskMessage ? (
            <div className="space-y-4">
              <Textarea
                value={kioskMessage}
                onChange={(e) => setKioskMessage(e.target.value)}
                placeholder="Enter a message to show when this member logs in at the kiosk..."
                rows={3}
              />
              {kioskMessage && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleClearKioskMessage}
                  disabled={savingKioskMessage}
                  className="text-red-600 hover:text-red-700 bg-transparent"
                >
                  Remove Message
                </Button>
              )}
            </div>
          ) : kioskMessage ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">{kioskMessage}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">No message set</p>
          )}
        </CardContent>
      </Card>

      {/* Pause Dialog */}
      <AlertDialog open={showPauseDialog} onOpenChange={setShowPauseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause Member Account</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent {member.first_name} from making purchases at the kiosk.
              They will see a message to contact PDCA.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="pauseReason">Reason (optional)</Label>
            <Input
              id="pauseReason"
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              placeholder="e.g., Outstanding balance"
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePause}>Pause Account</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {member.first_name} {member.last_name}?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mark Card as Declined Dialog */}
      {showDeclineDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Mark Card as Declined</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {declineMessage ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-green-900 mb-2">Card marked as declined. Member notified:</p>
                  <p className="text-sm text-green-800 whitespace-pre-wrap">{declineMessage}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-stone-600">
                    Are you sure you want to mark this card as declined? The member will receive an email notification with a 3-day deadline to resolve the issue.
                  </p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs text-amber-800">
                      <strong>Contact info:</strong> Yaakov Koegel | 845-573-1405
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
            <div className="flex gap-2 px-6 py-4 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeclineDialog(false);
                  setDeclineMessage(null);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
              {!declineMessage && (
                <Button
                  onClick={handleMarkCardDeclined}
                  disabled={saving}
                  className="flex-1"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-4 h-4 mr-2" />
                      Mark & Notify
                    </>
                  )}
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
