"use client";

// Business detail page - shows business info and transactions
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteBusiness, toggleBusinessStatus, updateBusinessFee, updateBusinessProfile, createBusinessAccount, sendBusinessMagicLink, sendBusinessPasswordReset, generateBusinessTempPassword, updateBusinessPresetAmounts, getPopularAmountsForBusiness } from "@/app/actions/admin";
import { toggleBusinessTransactionPermission } from "@/app/actions/toggle-business-transaction-permission";
import { Trash2, Monitor, TrendingUp, Receipt, Percent, Pencil, User, Mail, Phone, Save, X, Key, Send, Link2, Copy, Check, UserPlus, DollarSign, Sparkles, Plus, Loader2, Filter, ChevronDown, Calendar, Image as ImageIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Business, Transaction } from "@/lib/types";
import { BusinessIconUpload } from "@/components/business-icon-upload";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function BusinessDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingFee, setEditingFee] = useState(false);
  const [feePercentage, setFeePercentage] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    description: "",
    email: "",
    phone: "",
    username: "",
    notificationEmail: "",
  });
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [accountAction, setAccountAction] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [presetAmounts, setPresetAmounts] = useState<number[]>([]);
  const [editingAmounts, setEditingAmounts] = useState(false);
  const [newAmount, setNewAmount] = useState("");
  const [savingAmounts, setSavingAmounts] = useState(false);
  const [loadingPopular, setLoadingPopular] = useState(false);
  const [thisMonthTotal, setThisMonthTotal] = useState(0); // Declare thisMonthTotal variable
  const [periodTotal, setPeriodTotal] = useState(0); // Declare periodTotal variable

  // Cycle filtering
  const [cycles, setCycles] = useState<Array<{ id: string; name: string; status: string; start_date: string; end_date: string }>>([]);
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"cycle" | "1m" | "3m" | "6m" | "1y" | "all">("all");

  useEffect(() => {
    async function load() {
      const { id } = await params;
      const supabase = createClient();

      const [bizRes, txRes, cyclesRes, activeCycleRes] = await Promise.all([
        supabase.from("businesses").select("*").eq("id", id).single(),
        supabase
          .from("transactions")
          .select(`*, members ( id, first_name, last_name, member_code )`)
          .eq("business_id", id)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("billing_cycles").select("*").order("created_at", { ascending: false }),
        supabase.from("billing_cycles").select("*").eq("status", "active").single(),
      ]);

      setBusiness(bizRes.data);
      setTransactions(txRes.data || []);
      setCycles(cyclesRes.data || []);
      
      // Default to active cycle if exists
      if (activeCycleRes.data) {
        setSelectedCycleId(activeCycleRes.data.id);
        setFilterType("cycle");
      }
      
      // Load preset amounts
      if (bizRes.data?.preset_amounts) {
        setPresetAmounts(bizRes.data.preset_amounts as number[]);
      } else {
        setPresetAmounts([5, 10, 15, 20, 25, 50]);
      }
      
      // Calculate this month's total
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const total = txRes.data?.reduce((sum, tx) => {
        const txDate = new Date(tx.created_at);
        return txDate >= startDate && txDate <= now ? sum + Number(tx.amount) : sum;
      }, 0) || 0;
      setThisMonthTotal(total);
      
      setLoading(false);
    }
    load();
  }, [params]);

  const handleDelete = async () => {
    if (!business) return;
    await deleteBusiness(business.id);
    router.push("/admin/businesses");
  };

  const handleToggleStatus = async () => {
    if (!business) return;
    await toggleBusinessStatus(business.id, !business.is_active);
    setBusiness({ ...business, is_active: !business.is_active });
  };

  const handleSaveFee = async () => {
    if (!business) return;
    const fee = parseFloat(feePercentage) || 0;
    await updateBusinessFee(business.id, fee);
    setBusiness({ ...business, fee_percentage: fee });
    setEditingFee(false);
  };

  const startEditingFee = () => {
    setFeePercentage(String(business?.fee_percentage || 0));
    setEditingFee(true);
  };

  const startEditingProfile = () => {
    if (!business) return;
    setProfileForm({
      name: business.name || "",
      description: business.description || "",
      email: business.email || "",
      phone: business.phone || "",
      username: business.username || "",
      notificationEmail: business.email || "",
    });
    setIconUrl(business.icon_url || null);
    setEditingProfile(true);
  };

  const handleSaveProfile = async () => {
    if (!business) return;
    setSavingProfile(true);
    await updateBusinessProfile(business.id, profileForm);
    setBusiness({
      ...business,
      name: profileForm.name,
      description: profileForm.description || null,
      email: profileForm.email || null,
      phone: profileForm.phone || null,
      username: profileForm.username || null,
      icon_url: iconUrl,
    });
    setSavingProfile(false);
    setEditingProfile(false);
  };

  const handleCreateAccount = async () => {
    if (!business || (!business.email && !business.username)) {
      alert("Please save an email address or username first");
      return;
    }
    setAccountAction("creating");
    
    // For username-only accounts, generate a temp password
    if (business.username && !business.email) {
      const result = await generateBusinessTempPassword(business.id);
      if (result.success && result.tempPassword) {
        setTempPassword(result.tempPassword);
        setBusiness({ ...business, password_hash: "set" });
        alert("Account created! The temporary password is shown below.");
      } else {
        alert("Error: " + (result.error || "Failed to create account"));
      }
    } else {
      // Email-based account
      const result = await createBusinessAccount(business.id, business.email!);
      if (result.success) {
        setBusiness({ ...business, auth_user_id: "set" });
        alert("Account created! You can now send login info separately.");
      } else {
        alert("Error: " + result.error);
      }
    }
    setAccountAction(null);
  };

  const handleSendMagicLink = async () => {
    if (!business || !business.email) return;
    setAccountAction("magic");
    const result = await sendBusinessMagicLink(business.id, business.email);
    if (result.success) {
      alert("Magic link sent to " + business.email);
    } else {
      alert("Error: " + result.error);
    }
    setAccountAction(null);
  };

  const handleSendPasswordReset = async () => {
    if (!business || !business.email) return;
    setAccountAction("reset");
    const result = await sendBusinessPasswordReset(business.id, business.email);
    if (result.success) {
      alert("Password reset link sent to " + business.email);
    } else {
      alert("Error: " + result.error);
    }
    setAccountAction(null);
  };

  const handleGenerateTempPassword = async () => {
    if (!business || (!business.email && !business.username)) return;
    setAccountAction("temp");
    const result = await generateBusinessTempPassword(business.id, business.email || undefined);
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

  const handleAddAmount = () => {
    const amount = parseFloat(newAmount);
    if (amount > 0 && !presetAmounts.includes(amount)) {
      setPresetAmounts([...presetAmounts, amount].sort((a, b) => a - b));
      setNewAmount("");
    }
  };

  const handleRemoveAmount = (amount: number) => {
    setPresetAmounts(presetAmounts.filter(a => a !== amount));
  };

  const handleSaveAmounts = async () => {
    if (!business) return;
    setSavingAmounts(true);
    await updateBusinessPresetAmounts(business.id, presetAmounts);
    setSavingAmounts(false);
    setEditingAmounts(false);
  };

  const handlePopulateFromHistory = async () => {
    if (!business) return;
    setLoadingPopular(true);
    const result = await getPopularAmountsForBusiness(business.id);
    if (result.success && result.amounts) {
      setPresetAmounts(result.amounts);
    }
    setLoadingPopular(false);
  };

  const handleToggleTransactionPermission = async () => {
    if (!business) return;
    const newValue = !business.can_add_transactions;
    const result = await toggleBusinessTransactionPermission(business.id, newValue);
    if (result.success) {
      setBusiness({ ...business, can_add_transactions: newValue });
    } else {
      alert("Error: " + result.error);
    }
  };

  useEffect(() => {
    const calculatePeriodTotal = () => {
      const filteredTransactions = getFilteredTransactions();
      const total = filteredTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
      setPeriodTotal(total);
    };

    calculatePeriodTotal();
  }, [filterType, selectedCycleId, transactions]);

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
  const totalRevenue = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
  const feeAmount = business ? filteredTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0) * (Number(business.fee_percentage) / 100) : 0;
  const netPayout = filteredTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0) - feeAmount;

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!business) {
    return (
      <div className="max-w-7xl mx-auto">
        <p className="text-center text-muted-foreground py-12">Business not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/admin/businesses" className="hover:text-foreground">
          Businesses
        </Link>
        <span>/</span>
        <span className="text-foreground">{business.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground">{business.name}</h1>
            <span
              className={`text-xs font-medium px-2 py-1 rounded-full ${
                business.is_active
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {business.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          {business.description && (
            <p className="text-muted-foreground mt-2">{business.description}</p>
          )}
        </div>
        <div className="flex gap-3">
          <Link href={`/kiosk/${business.id}`} target="_blank">
            <Button variant="outline">
              <Monitor className="w-4 h-4 mr-2" />
              Open Kiosk
            </Button>
          </Link>
          <Button variant="outline" onClick={handleToggleStatus}>
            {business.is_active ? "Deactivate" : "Activate"}
          </Button>
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Period Filter */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Statistics</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
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
              <div className="bg-orange-50 p-3 rounded-xl">
                <Receipt className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">All Time Revenue</p>
                <p className="text-2xl font-bold text-foreground">₪{totalRevenue.toFixed(2)}</p>
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
                <p className="text-sm text-muted-foreground">All Transactions</p>
                <p className="text-2xl font-bold text-foreground">{transactions.length}</p>
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
            Business Profile
          </CardTitle>
          {!editingProfile ? (
            <Button variant="outline" onClick={startEditingProfile}>Edit Profile</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditingProfile(false)} disabled={savingProfile}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSaveProfile} disabled={savingProfile}>
                <Save className="w-4 h-4 mr-2" />
                {savingProfile ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Business Name</Label>
                {editingProfile ? (
                  <Input
                    value={profileForm.name}
                    onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  />
                ) : (
                  <p className="font-medium">{business.name}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                {editingProfile ? (
                  <Input
                    value={profileForm.description}
                    onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
                    placeholder="Optional description"
                  />
                ) : (
                  <p className="font-medium">{business.description || "-"}</p>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Login Username
                </Label>
                {editingProfile ? (
                  <Input
                    type="text"
                    value={profileForm.username}
                    onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                    placeholder="e.g. cafeteria"
                  />
                ) : (
                  <p className="font-medium font-mono">{business.username || "-"}</p>
                )}
                <p className="text-xs text-muted-foreground">Used for business portal login (letters, numbers, underscore only)</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </Label>
                {editingProfile ? (
                  <Input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })}
                  />
                ) : (
                  <p className="font-medium">{business.email || "-"}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Notification Email
                </Label>
                {editingProfile ? (
                  <Input
                    type="email"
                    value={profileForm.notificationEmail}
                    onChange={(e) => setProfileForm({ ...profileForm, notificationEmail: e.target.value })}
                    placeholder="Email for transaction alerts"
                  />
                ) : (
                  <p className="font-medium">{(business as any).notification_email || "-"}</p>
                )}
                <p className="text-xs text-muted-foreground">Email address to receive transaction notifications</p>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Percent className="w-4 h-4" />
                  Fee Percentage
                </Label>
                {editingFee ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={feePercentage}
                      onChange={(e) => setFeePercentage(e.target.value)}
                      className="w-24"
                    />
                    <span>%</span>
                    <Button size="sm" onClick={handleSaveFee}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingFee(false)}>Cancel</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{Number(business.fee_percentage || 0).toFixed(1)}%</p>
                    <Button variant="ghost" size="sm" onClick={startEditingFee}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
              {editingProfile && (
                <BusinessIconUpload
                  businessId={business.id}
                  businessName={business.name}
                  currentIconUrl={iconUrl}
                  onUploadSuccess={(url) => setIconUrl(url)}
                  onUploadError={(error) => alert(`Icon upload error: ${error}`)}
                />
              )}
              {/* Account Management Section */}
              <div className="space-y-2 pt-4 border-t">
                <Label className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  Account Access
                </Label>
                
                {!business.auth_user_id && !business.password_hash ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">No account created yet</p>
                    {(business.email || business.username) ? (
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
                        <p className="text-xs text-muted-foreground">
                          {business.username ? "Uses username/password login" : "Create account first, then send login info separately"}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Add an email or username to enable account creation</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 bg-primary/5 rounded-lg">
                      <p className="text text text-primary font-medium">Account active</p>
                      <p className="text-xs text-muted-foreground mt-1">Login: /business/login</p>
                    </div>
                    
                    {tempPassword && (
                      <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                        <p className="text-sm font-medium text-orange-800 mb-2">Temporary Password</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-white px-3 py-2 rounded border font-mono text-lg tracking-tracking-wide">
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
                        {accountAction === "reset" ? "Resetting..." : "Reset Password"}
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

              {/* Transaction Permission Toggle */}
              {(business.auth_user_id || business.password_hash) && (
                <div className="space-y-2 pt-4 border-t">
                  <Label className="flex items-center gap-2">
                    <Receipt className="w-4 h-4" />
                    Transaction Permissions
                  </Label>
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Allow Self-Service Transactions</p>
                      <p className="text-xs text-muted-foreground">
                        Enable business to add transactions themselves
                      </p>
                    </div>
                    <Button
                      variant={business.can_add_transactions ? "default" : "outline"}
                      size="sm"
                      onClick={handleToggleTransactionPermission}
                    >
                      {business.can_add_transactions ? "Enabled" : "Disabled"}
                    </Button>
                  </div>
                  {business.can_add_transactions && (
                    <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
                      This business can now add transactions from their portal
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preset Amounts Card */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Quick Amount Buttons
          </CardTitle>
          {!editingAmounts ? (
            <Button variant="outline" onClick={() => setEditingAmounts(true)}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit Amounts
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditingAmounts(false)} disabled={savingAmounts}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSaveAmounts} disabled={savingAmounts}>
                {savingAmounts ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {savingAmounts ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            These amounts appear as quick-select buttons on the kiosk for faster checkout.
          </p>
          
          {/* Current amounts display */}
          <div className="flex flex-wrap gap-2 mb-4">
            {presetAmounts.map((amount) => (
              <div
                key={amount}
                className={`px-4 py-2 rounded-lg border ${
                  editingAmounts 
                    ? "bg-stone-50 border-stone-200 pr-2" 
                    : "bg-stone-100 border-stone-200"
                } flex items-center gap-2`}
              >
                <span className="font-medium">₪{amount}</span>
                {editingAmounts && (
                  <button
                    onClick={() => handleRemoveAmount(amount)}
                    className="w-5 h-5 rounded-full bg-stone-200 hover:bg-red-100 hover:text-red-600 flex items-center justify-center text-stone-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {presetAmounts.length === 0 && (
              <p className="text-muted-foreground text-sm">No quick amounts set</p>
            )}
          </div>

          {/* Edit controls */}
          {editingAmounts && (
            <div className="space-y-4 pt-4 border-t">
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Enter amount"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  className="w-32"
                  min="0"
                  step="0.5"
                />
                <Button variant="outline" onClick={handleAddAmount} disabled={!newAmount}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </div>
              
              <div className="flex items-center gap-4">
                <Button
                  variant="secondary"
                  onClick={handlePopulateFromHistory}
                  disabled={loadingPopular}
                >
                  {loadingPopular ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Auto-populate from transaction history
                </Button>
                <span className="text-sm text-muted-foreground">
                  Uses the most common amounts from past transactions
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>{getFilterLabel()} Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredTransactions.length > 0 ? (
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.slice(0, 20).map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-muted-foreground">
                        {new Date(tx.created_at).toLocaleDateString()} {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell>
                        {tx.members ? (
                          <Link href={`/admin/members/${tx.members.id}`} className="hover:underline text-primary">
                            {tx.members.first_name} {tx.members.last_name}
                          </Link>
                        ) : "-"}
                      </TableCell>
                      <TableCell>{tx.description || "-"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        ₪{Number(tx.amount).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No transactions yet</p>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Business</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {business.name}? This will hide the business from the kiosk but preserve transaction history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete Business
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
