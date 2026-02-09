"use client";

import React from "react"

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Loader2, Mail } from "lucide-react";
import { getDeviceName } from "@/lib/device-fingerprint";
import { Checkbox } from "@/components/ui/checkbox";

export default function AdminMFAVerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resending, setResending] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  
  const adminId = searchParams.get("admin_id");
  const email = searchParams.get("email");
  const deviceFingerprint = searchParams.get("device");

  useEffect(() => {
    if (!adminId || !email) {
      router.push("/auth/login");
      return;
    }

    // Send MFA code on page load
    async function sendCode() {
      await fetch("/api/admin/mfa/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, adminId }),
      });
    }

    sendCode();
  }, [adminId, email, router]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!adminId) return;

    const response = await fetch("/api/admin/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminId, code }),
    });

    const result = await response.json();

    if (result.success) {
      // If "Remember Me" is checked, trust this device
      if (rememberDevice && deviceFingerprint) {
        console.log("[v0] Trusting device with fingerprint:", deviceFingerprint);
        const deviceName = getDeviceName();
        const trustResponse = await fetch("/api/admin/mfa/trust-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminId, deviceFingerprint, deviceName }),
        });
        const trustResult = await trustResponse.json();
        console.log("[v0] Trust device result:", trustResult);
        
        if (!trustResult.success) {
          console.error("[v0] Failed to trust device:", trustResult.error);
        }
      }
      
      // Force full page reload to admin portal to ensure layout re-checks authentication
      window.location.href = "/admin";
    } else {
      setError(result.error || "Verification failed");
    }

    setLoading(false);
  }

  async function handleResend() {
    if (!adminId || !email) return;
    
    setResending(true);
    setError("");

    const response = await fetch("/api/admin/mfa/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, adminId }),
    });

    const result = await response.json();

    if (result.success) {
      setError("");
      alert("New code sent to your email");
    } else {
      setError(result.error || "Failed to resend code");
    }

    setResending(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-emerald-600" />
          </div>
          <CardTitle className="text-2xl">Verify Your Identity</CardTitle>
          <CardDescription>
            Enter the 6-digit code sent to {email}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                type="text"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                className="text-center text-2xl tracking-widest"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="remember" 
                checked={rememberDevice}
                onCheckedChange={(checked) => setRememberDevice(checked as boolean)}
              />
              <label
                htmlFor="remember"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Remember this device for 30 days
              </label>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || code.length !== 6}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Verify Code"
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={handleResend}
              disabled={resending}
            >
              {resending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Resend Code
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
