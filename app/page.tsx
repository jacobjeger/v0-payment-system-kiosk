"use client";

import React from "react"

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Store, Users, Shield, UserPlus, Loader2, Check } from "lucide-react";
import { registerMember } from "@/app/actions/register";

export default function PortalPage() {
  const [showRegister, setShowRegister] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState("");
  
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    israeliPhone: "",
    memberType: "",
    cardNumber: "",
    cardExpMonth: "",
    cardExpYear: "",
    cardCvv: "",
    pinCode: "",
    confirmPin: "",
  });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!form.firstName || !form.lastName || !form.email || !form.phone || !form.israeliPhone || !form.memberType || !form.cardNumber || !form.cardExpMonth || !form.cardExpYear || !form.cardCvv || !form.pinCode) {
      setError("Please fill in all required fields");
      return;
    }
    
    if (form.pinCode !== form.confirmPin) {
      setError("PIN codes do not match");
      return;
    }
    
    if (!/^\d{4}$/.test(form.pinCode)) {
      setError("PIN must be exactly 4 digits");
      return;
    }

    if (!/^\d{13,19}$/.test(form.cardNumber.replace(/\s/g, ""))) {
      setError("Please enter a valid card number");
      return;
    }

    if (!/^\d{3,4}$/.test(form.cardCvv)) {
      setError("Please enter a valid CVV");
      return;
    }
    
    setRegistering(true);
    const result = await registerMember({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      israeliPhone: form.israeliPhone,
      memberType: form.memberType,
      cardNumber: form.cardNumber.replace(/\s/g, ""),
      cardExpMonth: form.cardExpMonth,
      cardExpYear: form.cardExpYear,
      cardCvv: form.cardCvv,
      pinCode: form.pinCode,
    });
    
    if (result.success) {
      setRegistered(true);
    } else {
      setError(result.error || "Registration failed");
    }
    setRegistering(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100 flex flex-col">
      {/* Header */}
      <header className="p-6 flex items-center justify-end">
        <span className="text-xl font-bold text-stone-900">PDCA</span>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-stone-900 mb-3">Welcome to PDCA</h1>
            <p className="text-stone-600 text-lg">Payment & Debit Card Administration System</p>
          </div>

          {/* Login Options */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {/* Customer Login */}
            <Link href="/member/login">
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-300 group">
                <CardHeader className="text-center pb-2">
                  <div className="w-16 h-16 bg-blue-100 group-hover:bg-blue-200 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors">
                    <Users className="w-8 h-8 text-blue-600" />
                  </div>
                  <CardTitle className="text-xl">Customer Login</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <CardDescription className="text-sm">
                    View your balance, transactions, and manage your account
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>

            {/* Business Login */}
            <Link href="/business/login">
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-emerald-300 group">
                <CardHeader className="text-center pb-2">
                  <div className="w-16 h-16 bg-emerald-100 group-hover:bg-emerald-200 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors">
                    <Store className="w-8 h-8 text-emerald-600" />
                  </div>
                  <CardTitle className="text-xl">Business Login</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <CardDescription className="text-sm">
                    Access your business dashboard, view transactions and payouts
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>

            {/* Admin Login */}
            <Link href="/auth/login">
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-stone-400 group">
                <CardHeader className="text-center pb-2">
                  <div className="w-16 h-16 bg-stone-200 group-hover:bg-stone-300 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors">
                    <Shield className="w-8 h-8 text-stone-700" />
                  </div>
                  <CardTitle className="text-xl">Admin Login</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <CardDescription className="text-sm">
                    System administration, manage members, businesses and billing
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Register Section */}
          <div className="text-center">
            <p className="text-stone-500 mb-4">New to PDCA?</p>
            <Button 
              size="lg" 
              onClick={() => setShowRegister(true)}
              className="gap-2"
            >
              <UserPlus className="w-5 h-5" />
              Register for an Account
            </Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="p-6 text-center text-stone-400 text-sm">
        PDCA Payment System
      </footer>

      {/* Registration Dialog */}
      <Dialog open={showRegister} onOpenChange={setShowRegister}>
        <DialogContent className="sm:max-w-md">
          {registered ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <DialogTitle className="text-xl mb-2">Registration Submitted!</DialogTitle>
              <DialogDescription className="mb-6">
                Your application has been submitted for review. You will receive an email once your account is approved.
              </DialogDescription>
              <Button onClick={() => { 
                setShowRegister(false); 
                setRegistered(false); 
                setForm({ firstName: "", lastName: "", email: "", phone: "", israeliPhone: "", memberType: "", cardNumber: "", cardExpMonth: "", cardExpYear: "", cardCvv: "", pinCode: "", confirmPin: "" }); 
              }}>
                Close
              </Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Register for PDCA</DialogTitle>
                <DialogDescription>
                  Fill out the form below to request an account. All fields are required.
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleRegister} className="space-y-4 mt-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      placeholder="John"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input
                      id="lastName"
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      placeholder="Doe"
                      required
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="john@example.com"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone">US Phone Number *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="israeliPhone">Israeli Phone Number *</Label>
                  <Input
                    id="israeliPhone"
                    type="tel"
                    value={form.israeliPhone}
                    onChange={(e) => setForm({ ...form, israeliPhone: e.target.value })}
                    placeholder="+972-50-123-4567"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="memberType">Member Type *</Label>
                  <select
                    id="memberType"
                    value={form.memberType}
                    onChange={(e) => setForm({ ...form, memberType: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    required
                  >
                    <option value="">Select type...</option>
                    <option value="yeshiva">Yeshiva</option>
                    <option value="avreich">Avreich</option>
                    <option value="rebbe">Rebbe</option>
                    <option value="frequent_visitor">Frequent Visitor</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Credit Card Information *</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="cardNumber">Card Number *</Label>
                      <Input
                        id="cardNumber"
                        value={form.cardNumber}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\s/g, "").replace(/\D/g, "");
                          const formatted = value.match(/.{1,4}/g)?.join(" ") || value;
                          setForm({ ...form, cardNumber: formatted });
                        }}
                        placeholder="1234 5678 9012 3456"
                        maxLength={19}
                        required
                      />
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="cardExpMonth">Month *</Label>
                        <Input
                          id="cardExpMonth"
                          value={form.cardExpMonth}
                          onChange={(e) => setForm({ ...form, cardExpMonth: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                          placeholder="MM"
                          maxLength={2}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cardExpYear">Year *</Label>
                        <Input
                          id="cardExpYear"
                          value={form.cardExpYear}
                          onChange={(e) => setForm({ ...form, cardExpYear: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                          placeholder="YY"
                          maxLength={2}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cardCvv">CVV *</Label>
                        <Input
                          id="cardCvv"
                          type="password"
                          value={form.cardCvv}
                          onChange={(e) => setForm({ ...form, cardCvv: e.target.value.replace(/\D/g, "") })}
                          placeholder="123"
                          maxLength={4}
                          required
                        />
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="pinCode">Kiosk PIN *</Label>
                    <Input
                      id="pinCode"
                      type="password"
                      maxLength={4}
                      value={form.pinCode}
                      onChange={(e) => setForm({ ...form, pinCode: e.target.value.replace(/\D/g, "") })}
                      placeholder="4 digits"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPin">Confirm PIN *</Label>
                    <Input
                      id="confirmPin"
                      type="password"
                      maxLength={4}
                      value={form.confirmPin}
                      onChange={(e) => setForm({ ...form, confirmPin: e.target.value.replace(/\D/g, "") })}
                      placeholder="4 digits"
                      required
                    />
                  </div>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  The PIN is used to verify your identity at the kiosk. You can set or change it later.
                </p>
                
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}
                
                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowRegister(false)} className="flex-1 bg-transparent">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={registering} className="flex-1">
                    {registering ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {registering ? "Submitting..." : "Submit Application"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
