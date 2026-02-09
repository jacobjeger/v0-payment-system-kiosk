"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { verifyResetToken, completePasswordReset } from "@/app/actions/admin";
import { Loader2, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";

export default function AdminResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  useEffect(() => {
    async function verify() {
      if (!token) {
        setError("No reset token provided");
        setVerifying(false);
        return;
      }

      const result = await verifyResetToken(token);
      if (result.valid) {
        setTokenValid(true);
      } else {
        setError(result.error || "Invalid or expired reset link");
      }
      setVerifying(false);
    }
    verify();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    const result = await completePasswordReset(token!, password);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        router.push("/auth/login");
      }, 2000);
    } else {
      setError(result.error || "Failed to reset password");
    }
    setLoading(false);
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-stone-400 mx-auto mb-4" />
          <p className="text-stone-600">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-stone-900 mb-2">Password Reset!</h2>
          <p className="text-stone-600">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
        <div className="w-full max-w-sm text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-stone-900 mb-2">Invalid Link</h2>
          <p className="text-stone-600 mb-6">{error}</p>
          <button
            onClick={() => router.push("/auth/login")}
            className="text-green-600 hover:text-green-700 font-medium"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-stone-900">PDCA</h1>
            <p className="text-stone-500 text-sm mt-1">Reset Your Password</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-stone-700">
                New Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-stone-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 outline-none transition-all pr-10"
                  placeholder="Enter new password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-stone-700">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-stone-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 outline-none transition-all"
                placeholder="Confirm new password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Resetting...
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
