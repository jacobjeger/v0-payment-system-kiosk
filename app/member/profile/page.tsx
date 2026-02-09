"use client";

import React from "react";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, User, Lock, Mail, CreditCard, Save, Eye, EyeOff, Loader2, AlertTriangle, Check, Clock, RefreshCw } from "lucide-react";
import { submitNewCard, requestRetryCharge, getMemberCardLast4, markCardAsDeclined } from "@/app/actions/member";

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  card_number: string | null;
  card_exp_month: string | null;
  card_exp_year: string | null;
  card_cvc: string | null;
  card_zip: string | null;
  card_status: string | null;
  declined_at: string | null;
}

interface PendingCardChange {
  id: string;
  status: string;
  request_type: string;
  created_at: string;
}

export default function MemberProfilePage() {
  const router = useRouter();
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [pendingCardRequest, setPendingCardRequest] = useState<PendingCardChange | null>(null);
  const [cardLast4, setCardLast4] = useState<string>("");
  const [declineDeadline, setDeclineDeadline] = useState<string | null>(null);

  // Profile form
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  // Account form
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  // Card form - NEW card submission
  const [newCardNumber, setNewCardNumber] = useState("");
  const [newCardExpMonth, setNewCardExpMonth] = useState("");
  const [newCardExpYear, setNewCardExpYear] = useState("");
  const [newCardCvc, setNewCardCvc] = useState("");
  const [newCardZip, setNewCardZip] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push("/member/login");
      return;
    }

    const { data: memberData } = await supabase
      .from("members")
      .select("*")
      .eq("auth_user_id", user.id)
      .single();

    if (!memberData) {
      router.push("/member/login");
      return;
    }

    // Check for pending card change requests
    const { data: pendingRequest } = await supabase
      .from("pending_card_changes")
      .select("*")
      .eq("member_id", memberData.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    setMember(memberData);
    setPendingCardRequest(pendingRequest);
    setFirstName(memberData.first_name || "");
    setLastName(memberData.last_name || "");
    setPhone(memberData.phone || "");
    setEmail(user.email || "");
    
    // Load decrypted card last 4 digits
    if (memberData.card_number) {
      const last4 = await getMemberCardLast4(memberData.id);
      setCardLast4(last4);
    }

    // Calculate deadline if card was declined
    if (memberData.declined_at) {
      const declinedDate = new Date(memberData.declined_at);
      const deadline = new Date(declinedDate.getTime() + 3 * 24 * 60 * 60 * 1000);
      setDeclineDeadline(deadline.toISOString());
    }
    
    setLoading(false);
  }

  async function handleUpdateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;

    setSaving(true);
    setMessage({ type: "", text: "" });

    const supabase = createClient();
    const { error } = await supabase
      .from("members")
      .update({
        first_name: firstName,
        last_name: lastName,
        phone: phone || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", member.id);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Profile updated successfully!" });
    }
    setSaving(false);
  }

  async function handleUpdateEmail(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: "", text: "" });

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Email updated! Check your inbox to confirm." });
    }
    setSaving(false);
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "Passwords do not match" });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    setSaving(true);
    setMessage({ type: "", text: "" });

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Password updated successfully!" });
      setNewPassword("");
      setConfirmPassword("");
    }
    setSaving(false);
  }

  async function handleSubmitNewCard(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;

    if (!newCardNumber || !newCardExpMonth || !newCardExpYear || !newCardCvc) {
      setMessage({ type: "error", text: "Please fill in all card fields" });
      return;
    }

    setSaving(true);
    setMessage({ type: "", text: "" });

    // Use server action to encrypt and store card data
    const result = await submitNewCard({
      memberId: member.id,
      cardNumber: newCardNumber,
      cardCvc: newCardCvc,
      cardExpMonth: newCardExpMonth,
      cardExpYear: newCardExpYear,
      cardZip: newCardZip || undefined,
    });

    if (!result.success) {
      setMessage({ type: "error", text: result.error || "Failed to submit card" });
    } else {
      setMessage({ type: "success", text: "Card information submitted for review. An admin will approve the change shortly." });
      setNewCardNumber("");
      setNewCardExpMonth("");
      setNewCardExpYear("");
      setNewCardCvc("");
      setNewCardZip("");
      // Refresh to show pending state
      await checkAuth();
    }
    setSaving(false);
  }

  async function handleRequestRetryCharge() {
    if (!member) return;

    setSaving(true);
    setMessage({ type: "", text: "" });

    // Use server action
    const result = await requestRetryCharge(member.id);

    if (!result.success) {
      setMessage({ type: "error", text: result.error || "Failed to submit request" });
    } else {
      setMessage({ type: "success", text: "Request submitted. An admin will retry charging your card." });
      await checkAuth();
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!member) return null;

  const showDeclinedBanner = member.card_status === "declined";
  const showPendingBanner = member.card_status === "pending_review" || pendingCardRequest;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/member/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Profile Settings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {message.text && (
          <div className={`p-4 rounded-lg ${
            message.type === "error" 
              ? "bg-destructive/10 text-destructive" 
              : "bg-green-100 text-green-700"
          }`}>
            {message.text}
          </div>
        )}

        {/* Declined Card Banner */}
        {showDeclinedBanner && !showPendingBanner && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900 mb-3">Your Card Declined for Collection Payment</h3>
                  <p className="text-sm text-red-700 mb-3 whitespace-pre-line">
                    {`Please go over to Yaakov Koegel or call 845-573-1405 to resolve this issue.\n\nYour account will be closed if it's not resolved by ${
                      declineDeadline 
                        ? new Date(declineDeadline).toLocaleString("en-US", { 
                            weekday: "long", 
                            month: "long", 
                            day: "numeric", 
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit"
                          })
                        : "3 days from now"
                    }.\n\nYou can update your card information at tcpdca.com.`}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button size="sm" onClick={handleRequestRetryCharge} disabled={saving}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Try Charging Again
                    </Button>
                    <p className="text-sm text-red-600 self-center">or submit a new card below</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending Review Banner */}
        {showPendingBanner && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900 mb-1">Request Pending Review</h3>
                  <p className="text-sm text-amber-700">
                    {pendingCardRequest?.request_type === "retry_charge" 
                      ? "Your request to retry charging your card is pending admin review."
                      : "Your new card information has been submitted and is pending admin approval."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Personal Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Email */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Address
            </CardTitle>
            <CardDescription>
              Update your email. You'll need to verify the new address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateEmail} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={saving}>
                Update Email
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Change Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showPasswords ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPasswords(!showPasswords)}
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type={showPasswords ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" disabled={saving}>
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Current Card Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Current Payment Card
            </CardTitle>
            <CardDescription>
              Your current card on file
            </CardDescription>
          </CardHeader>
          <CardContent>
            {member.card_number ? (
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-900 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-medium">**** **** **** {cardLast4 || "****"}</p>
                  <p className="text-sm text-muted-foreground">
                    Expires {member.card_exp_month}/{member.card_exp_year}
                  </p>
                </div>
                {member.card_status === "active" && (
                  <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
                    <Check className="w-3 h-3" /> Active
                  </span>
                )}
                {member.card_status === "declined" && (
                  <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">
                    <AlertTriangle className="w-3 h-3" /> Declined
                  </span>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No card on file</p>
            )}
          </CardContent>
        </Card>

        {/* Submit New Card */}
        <Card id="payment-card" className={showDeclinedBanner && !showPendingBanner ? "border-primary" : ""}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              {showDeclinedBanner ? "Submit New Card" : "Update Payment Card"}
            </CardTitle>
            <CardDescription>
              Submit new card details for admin approval. Your current card will remain active until approved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pendingCardRequest?.request_type === "update_card" ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Check className="w-4 h-4 text-green-600" />
                  <p className="text-green-800 font-medium text-sm">Card Submitted Successfully</p>
                </div>
                <p className="text-green-700 text-sm">
                  Your new card information has been submitted and is awaiting admin approval. You'll be notified once it's been reviewed.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitNewCard} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newCardNumber">Card Number</Label>
                  <Input
                    id="newCardNumber"
                    value={newCardNumber}
                    onChange={(e) => setNewCardNumber(e.target.value)}
                    placeholder="1234 5678 9012 3456"
                    required
                  />
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="newCardExpMonth">Month</Label>
                    <Input
                      id="newCardExpMonth"
                      value={newCardExpMonth}
                      onChange={(e) => setNewCardExpMonth(e.target.value)}
                      placeholder="MM"
                      maxLength={2}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newCardExpYear">Year</Label>
                    <Input
                      id="newCardExpYear"
                      value={newCardExpYear}
                      onChange={(e) => setNewCardExpYear(e.target.value)}
                      placeholder="YY"
                      maxLength={2}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newCardCvc">CVC</Label>
                    <Input
                      id="newCardCvc"
                      type="password"
                      value={newCardCvc}
                      onChange={(e) => setNewCardCvc(e.target.value)}
                      placeholder="123"
                      maxLength={4}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newCardZip">ZIP</Label>
                    <Input
                      id="newCardZip"
                      value={newCardZip}
                      onChange={(e) => setNewCardZip(e.target.value)}
                      placeholder="12345"
                    />
                  </div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    Card changes require admin approval for security. You'll be notified once approved.
                  </p>
                </div>
                <Button type="submit" disabled={saving}>
                  <Save className="w-4 h-4 mr-2" />
                  Submit for Approval
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
