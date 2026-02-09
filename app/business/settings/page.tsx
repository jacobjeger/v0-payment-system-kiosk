"use client";

import React from "react"

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Save, Lock, Mail, Eye, EyeOff, Plus, X, DollarSign, BarChart3 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Business } from "@/lib/types";
import type { User } from "@supabase/supabase-js";

export default function BusinessSettingsPage() {
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [presetAmounts, setPresetAmounts] = useState<number[]>([]);
  const [newAmount, setNewAmount] = useState("");
  const [activeDaysAverage, setActiveDaysAverage] = useState(false);
  
  
  // Profile state
  const [user, setUser] = useState<User | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const supabase = createClient();
    const pinBusinessId = sessionStorage.getItem("business_id") || localStorage.getItem("business_id");
    
    let bizId: string | null = null;
    
    if (pinBusinessId) {
      bizId = pinBusinessId;
    } else {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/business/login");
        return;
      }
      setUser(authUser);
      setAccountEmail(authUser.email || "");
      const { data } = await supabase
        .from("businesses")
        .select("id")
        .eq("auth_user_id", authUser.id)
        .single();
      
      if (data) {
        bizId = data.id;
      } else {
        router.push("/business/login");
        return;
      }
    }

    // Load business details
    const { data: biz } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", bizId)
      .single();

    if (biz) {
      setBusiness(biz);
      setName(biz.name);
      setDescription(biz.description || "");
      setPresetAmounts(biz.preset_amounts || []);
      setActiveDaysAverage(biz.active_days_average || false);
    }
    
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!business) return;

    setSaving(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase
      .from("businesses")
      .update({
        name,
        description: description || null,
        preset_amounts: presetAmounts.length > 0 ? presetAmounts : null,
        active_days_average: activeDaysAverage,
        updated_at: new Date().toISOString(),
      })
      .eq("id", business.id);

    if (error) {
      setMessage("Error saving settings: " + error.message);
    } else {
      setMessage("Settings saved successfully!");
      // Update session storage if name changed
      if (sessionStorage.getItem("business_name")) {
        sessionStorage.setItem("business_name", name);
      }
    }

    setSaving(false);
  }

  function addPresetAmount() {
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) return;
    if (presetAmounts.includes(amount)) return;
    setPresetAmounts([...presetAmounts, amount].sort((a, b) => a - b));
    setNewAmount("");
  }

  function removePresetAmount(amount: number) {
    setPresetAmounts(presetAmounts.filter(a => a !== amount));
  }

  async function handleUpdateEmail(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMessage({ type: "", text: "" });

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: accountEmail });

    if (error) {
      setProfileMessage({ type: "error", text: error.message });
    } else {
      setProfileMessage({ type: "success", text: "Email updated! Check your inbox to confirm." });
    }
    setSavingProfile(false);
  }

  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setProfileMessage({ type: "error", text: "Passwords do not match" });
      return;
    }

    if (newPassword.length < 6) {
      setProfileMessage({ type: "error", text: "Password must be at least 6 characters" });
      return;
    }

    setSavingProfile(true);
    setProfileMessage({ type: "", text: "" });

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      setProfileMessage({ type: "error", text: error.message });
    } else {
      setProfileMessage({ type: "success", text: "Password updated successfully!" });
      setNewPassword("");
      setConfirmPassword("");
    }
    setSavingProfile(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!business) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/business/dashboard">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Settings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Business Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </CardContent>
          </Card>

          {/* Preset Amounts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Kiosk Preset Amounts
              </CardTitle>
              <CardDescription>
                Customize the quick-select amounts shown on your kiosk. Leave empty to use system defaults.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Current amounts */}
                {presetAmounts.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {presetAmounts.map((amount) => (
                      <div
                        key={amount}
                        className="flex items-center gap-1 bg-primary/10 text-primary rounded-full pl-3 pr-1 py-1"
                      >
                        <span className="font-semibold">₪{amount}</span>
                        <button
                          type="button"
                          onClick={() => removePresetAmount(amount)}
                          className="p-1 hover:bg-primary/20 rounded-full"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Using system defaults: ₪5, ₪10, ₪15, ₪20, ₪25, ₪50</p>
                )}
                
                {/* Add new amount */}
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    placeholder="Add amount"
                    className="max-w-[150px]"
                    min="0"
                    step="0.5"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addPresetAmount}
                    disabled={!newAmount || parseFloat(newAmount) <= 0}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Analytics Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Analytics Settings
              </CardTitle>
              <CardDescription>
                Configure how your statistics are calculated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="active-days">Active days average</Label>
                  <p className="text-sm text-muted-foreground">
                    Calculate daily averages based only on days with at least one transaction, instead of all calendar days. Useful for businesses that only operate a few days per week.
                  </p>
                </div>
                <Switch
                  id="active-days"
                  checked={activeDaysAverage}
                  onCheckedChange={setActiveDaysAverage}
                />
              </div>
            </CardContent>
          </Card>

          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              message.includes("Error") 
                ? "bg-destructive/10 text-destructive" 
                : "bg-green-100 text-green-700"
            }`}>
              {message}
            </div>
          )}

          <Button type="submit" disabled={saving} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </form>

        {/* Account Profile Section */}
        {user && (
          <div className="mt-8 pt-8 border-t">
            <h2 className="text-xl font-bold mb-6">Account Settings</h2>
            
            {profileMessage.text && (
              <div className={`mb-6 p-4 rounded-lg ${
                profileMessage.type === "error" 
                  ? "bg-destructive/10 text-destructive" 
                  : "bg-green-100 text-green-700"
              }`}>
                {profileMessage.text}
              </div>
            )}

            {/* Email Section */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="w-4 h-4" />
                  Email Address
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpdateEmail} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="accountEmail">Email</Label>
                    <Input
                      id="accountEmail"
                      type="email"
                      value={accountEmail}
                      onChange={(e) => setAccountEmail(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" size="sm" disabled={savingProfile}>
                    Update Email
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Password Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Lock className="w-4 h-4" />
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
                  <Button type="submit" size="sm" disabled={savingProfile}>
                    Update Password
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
