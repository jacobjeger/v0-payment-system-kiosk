"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { requestPasswordReset } from "@/app/actions/admin";
import { Loader2, User } from "lucide-react";

export default function MemberLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const { data: member } = await supabase.from("members").select("id, must_change_password").eq("auth_user_id", data.user?.id).single();

    if (!member) {
      setError("No member account associated with this email");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    // Check if user needs to change password
    if (member.must_change_password) {
      router.push("/member/change-password");
      return;
    }

    router.push("/member/dashboard");
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Please enter your email address first");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");

    const result = await requestPasswordReset(email, "member");

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
      <div className="hidden lg:flex lg:w-[45%] bg-blue-600 items-center justify-center p-12">
        <div className="max-w-md text-center">
          <h1 className="text-4xl font-bold text-white mb-2">PDCA</h1>
          <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-8 mt-6">
            <User className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-3xl font-semibold text-white mb-4">Member Portal</h2>
          <p className="text-white/70 leading-relaxed">
            View your transaction history, check your balance, and manage your account settings.
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
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <User className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-zinc-900">Member Portal</span>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-zinc-900">Welcome back</h2>
            <p className="text-zinc-500 text-sm mt-1">Sign in to view your account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
                {error}
              </div>
            )}

            {message && (
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-600 rounded-lg text-sm">
                {message}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-zinc-700">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="your@email.com"
                disabled={loading}
                className="w-full h-11 px-4 rounded-lg border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-zinc-700">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full h-11 px-4 rounded-lg border border-zinc-200 bg-white text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
