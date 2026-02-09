"use client";

import React from "react"

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { User, Lock, Mail, Save, Eye, EyeOff, Shield, Loader2 } from "lucide-react";

export default function AdminProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  
  const [adminId, setAdminId] = useState<string | null>(null);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaToggling, setMfaToggling] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setEmail(user.email || "");
      
      // Load MFA settings
      const { data: adminData } = await supabase
        .from("admin_users")
        .select("id, mfa_enabled")
        .eq("email", user.email?.toLowerCase())
        .single();

      if (adminData) {
        setAdminId(adminData.id);
        setMfaEnabled(adminData.mfa_enabled || false);
      }
    }
    setLoading(false);
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
      setMessage({ type: "success", text: "Email updated! Check your inbox to confirm the change." });
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
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setSaving(false);
  }

  async function handleToggleMFA() {
    if (!adminId) return;

    setMfaToggling(true);
    const newValue = !mfaEnabled;

    const response = await fetch("/api/admin/mfa/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, enabled: newValue }),
    });

    const result = await response.json();

    if (result.success) {
      setMfaEnabled(newValue);
      setMessage({
        type: "success",
        text: newValue 
          ? "MFA enabled! You will need to verify with an email code on your next login from a new device." 
          : "MFA disabled."
      });
      if (!newValue) {
        sessionStorage.removeItem("admin_verified");
      }
    } else {
      setMessage({ type: "error", text: result.error || "Failed to toggle MFA" });
    }

    setMfaToggling(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <User className="w-8 h-8" />
          Profile Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your account settings and security
        </p>
      </div>

      {message.text && (
        <div className={`mb-6 p-4 rounded-lg ${
          message.type === "error" 
            ? "bg-destructive/10 text-destructive border border-destructive/20" 
            : "bg-green-50 text-green-700 border border-green-200"
        }`}>
          {message.text}
        </div>
      )}

      <div className="space-y-6">
        {/* Email Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Email Address
            </CardTitle>
            <CardDescription>
              Update your email address. You'll need to verify the new email.
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
                <Save className="w-4 h-4 mr-2" />
                Update Email
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Password Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              Change Password
            </CardTitle>
            <CardDescription>
              Update your password to keep your account secure
            </CardDescription>
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPasswords(!showPasswords)}
                  >
                    {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
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
                <Lock className="w-4 h-4 mr-2" />
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* MFA Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-500" />
              Multi-Factor Authentication
            </CardTitle>
            <CardDescription>
              Add an extra layer of security with email verification codes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium text-foreground">Email-Based MFA</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Receive a 6-digit code via email when logging in from new devices
                </p>
                {mfaEnabled && (
                  <p className="text-xs text-emerald-600 mt-2">
                    ✓ MFA is currently enabled for {email}
                  </p>
                )}
              </div>
              <Button
                variant={mfaEnabled ? "outline" : "default"}
                onClick={handleToggleMFA}
                disabled={mfaToggling}
              >
                {mfaToggling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : mfaEnabled ? (
                  "Disable MFA"
                ) : (
                  "Enable MFA"
                )}
              </Button>
            </div>

            {mfaEnabled && (
              <div className="mt-4 bg-blue-50 border border-blue-200 p-4 rounded-lg text-sm text-blue-800">
                <strong>Important:</strong> With MFA enabled, you'll receive a verification code via email when logging in from new devices. Make sure you have access to {email}.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
