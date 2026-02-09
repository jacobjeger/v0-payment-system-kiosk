"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Store } from "lucide-react";
import { loginBusinessWithCredentials, requestPasswordReset } from "@/app/actions/admin";

export default function BusinessLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(""); // Can be email or username
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    
    // Check if identifier is a username (no @ symbol) or email
    const isEmail = identifier.includes("@");
    
    if (!isEmail) {
      // Try username + password login first (no Supabase Auth needed)
      const result = await loginBusinessWithCredentials(identifier, password);
      
      if (result.success && result.businessId) {
        // Store business ID in localStorage for session management
        localStorage.setItem("business_id", result.businessId);
        localStorage.setItem("business_name", result.businessName || "");
        router.push("/business/dashboard");
        return;
      }
      
      // If direct login failed, show error
      setError(result.error || "Invalid username or password");
      setLoading(false);
      return;
    }
    
    // Email-based login uses Supabase Auth
    const { data, error: authError } = await supabase.auth.signInWithPassword({ 
      email: identifier, 
      password 
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const { data: businessData } = await supabase.from("businesses").select("id, name, must_change_password").eq("auth_user_id", data.user?.id).single();

    if (!businessData) {
      setError("No business associated with this account");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    // Store business ID for session
    localStorage.setItem("business_id", businessData.id);
    localStorage.setItem("business_name", businessData.name || "");

    // Check if user needs to change password
    if (businessData.must_change_password) {
      router.push("/business/change-password");
      return;
    }

    router.push("/business/dashboard");
  }

  async function handleForgotPassword() {
    if (!identifier) {
      setError("Please enter your email or username first");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    
    // Check if identifier is a username or email
    const isEmail = identifier.includes("@");
    let resetEmail = identifier;
    
    if (!isEmail) {
      // Look up the email by username
      const { data: business } = await supabase
        .from("businesses")
        .select("email")
        .eq("username", identifier.toLowerCase())
        .single();
      
      if (!business?.email) {
        setError("Username not found or no email associated");
        setLoading(false);
        return;
      }
      resetEmail = business.email;
    }
    
    const result = await requestPasswordReset(resetEmail, "business");

    if (!result.success) {
      setError(result.error || "Failed to send reset email");
    } else {
      setMessage(result.message || "Check your email for a password reset link");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-[45%] bg-emerald-600 items-center justify-center p-12">
        <div className="max-w-md text-center">
          <h1 className="text-4xl font-bold text-white mb-2">PDCA</h1>
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-8 mt-6">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-semibold text-white mb-4">Business Portal</h2>
          <p className="text-white/70 leading-relaxed">
            Access your dashboard to view transactions, manage settings, and track your business performance.
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 bg-[#fafaf8]">
        <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center justify-center mb-10">
            <h1 className="text-2xl font-bold text-zinc-900 mb-3">PDCA</h1>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center">
                <Store className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-zinc-900">Business Portal</span>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-zinc-900">Welcome back</h2>
            <p className="text-zinc-500 text-sm mt-1">Sign in to your business account</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 text-sm p-3 rounded-lg mb-4">
              {message}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label htmlFor="identifier" className="text-sm font-medium text-zinc-700">Username</label>
              <input
                id="identifier"
                type="text"
                placeholder="Enter your username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                disabled={loading}
                className="w-full h-11 px-4 rounded-lg border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all disabled:opacity-50"
              />
              <p className="text-xs text-zinc-500 mt-1">Use your business login username (letters, numbers, underscore only)</p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-zinc-700">Password</label>
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full h-11 px-4 rounded-lg border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm text-zinc-500 hover:text-zinc-700 transition-colors"
              disabled={loading}
            >
              Forgot password?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
