"use client";

import React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMember } from "@/app/actions/admin";
import { UserPlus, CreditCard } from "lucide-react";

export function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    
    // Validate required fields
    const email = formData.get("email") as string;
    const phone = formData.get("phone") as string;
    
    if (!email || !phone) {
      setError("Email and phone are required");
      setLoading(false);
      return;
    }

    const result = await addMember({
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email,
      phone,
      pinCode: formData.get("pinCode") as string,
      cardNumber: formData.get("cardNumber") as string,
      cardCvc: formData.get("cardCvc") as string,
      cardExpMonth: formData.get("cardExpMonth") as string,
      cardExpYear: formData.get("cardExpYear") as string,
      cardZip: formData.get("cardZip") as string,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="w-4 h-4 mr-2" />
          Add Member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                name="firstName"
                placeholder="First name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                name="lastName"
                placeholder="Last name"
                required
              />
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="email@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              placeholder="Phone number"
              required
            />
          </div>

          {/* PIN */}
          <div className="space-y-1.5">
            <Label htmlFor="pinCode">PIN Code (4 digits)</Label>
            <Input
              id="pinCode"
              name="pinCode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder="e.g., 1234"
              required
            />
            <p className="text-xs text-muted-foreground">
              Required for purchase verification at the kiosk
            </p>
          </div>

          {/* Credit Card Section */}
          <div className="border-t pt-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Credit Card Information</span>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cardNumber">Card Number</Label>
                <Input
                  id="cardNumber"
                  name="cardNumber"
                  placeholder="1234 5678 9012 3456"
                  maxLength={19}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cardExpMonth">Exp Month</Label>
                  <Input
                    id="cardExpMonth"
                    name="cardExpMonth"
                    placeholder="MM"
                    maxLength={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cardExpYear">Exp Year</Label>
                  <Input
                    id="cardExpYear"
                    name="cardExpYear"
                    placeholder="YY"
                    maxLength={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cardCvc">CVC</Label>
                  <Input
                    id="cardCvc"
                    name="cardCvc"
                    placeholder="123"
                    maxLength={4}
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label htmlFor="cardZip">Billing ZIP</Label>
                <Input
                  id="cardZip"
                  name="cardZip"
                  placeholder="12345"
                  maxLength={10}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-3 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Member"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
