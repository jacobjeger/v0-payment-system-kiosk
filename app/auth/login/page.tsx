"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ShieldCheck } from "lucide-react";
import { generateDeviceFingerprint } from "@/lib/device-fingerprint";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Check if this admin has MFA enabled
    const { data: adminData } = await supabase
      .from("admin_users")
      .select("id, mfa_enabled")
      .eq("email", email.toLowerCase())
      .single();

    if (adminData?.mfa_enabled) {
      // Generate device fingerprint
      const deviceFingerprint = generateDeviceFingerprint();
      
      // MFA is enabled - redirect to MFA verification page with device fingerprint
      router.push(
        `/auth/mfa-verify?email=${encodeURIComponent(email)}&admin_id=${adminData.id}&device=${encodeURIComponent(deviceFingerprint)}`
      );
      return;
    }

    // No MFA required, proceed to admin portal
    router.push("/admin");
    router.refresh();
    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email address first");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    
    const response = await fetch("/api/admin/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const result = await response.json();
    
    if (!result.success) {
      setError(result.error || "Failed to send reset email");
    } else {
      setMessage(result.message || "Check your email for a password reset link");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-stone-900">PDCA</h1>
            <p className="text-stone-500 text-sm mt-1">Admin Portal</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            {message && (
              <div className="p-3 bg-stone-100 border border-stone-200 rounded-lg text-stone-700 text-sm">
                {message}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-stone-700">Email</label>
              <input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full h-11 px-4 rounded-lg border border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 transition-all disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-stone-700">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full h-11 px-4 rounded-lg border border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-stone-400 focus:ring-2 focus:ring-stone-200 transition-all disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-stone-900 text-white rounded-lg text-sm font-medium hover:bg-stone-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
          
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm text-stone-500 hover:text-stone-700 transition-colors"
              disabled={loading}
            >
              Forgot password?
            </button>
          </div>
          <p className="text-center text-xs text-stone-400 mt-6">
            Contact your administrator if you need access
          </p>
        </div>
      </div>
    </div>
  );
}
