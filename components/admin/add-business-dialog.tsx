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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addBusiness } from "@/app/actions/admin";

export function AddBusinessDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validate username requires password
    if (username && !password) {
      setError("Password is required when setting a username");
      return;
    }
    if (username && password.length < 4) {
      setError("Password must be at least 4 characters");
      return;
    }

    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const result = await addBusiness({
      name: formData.get("name") as string,
      description: formData.get("description") as string,
      category: formData.get("category") as string,
      email: email || undefined,
      username: username || undefined,
      password: password || undefined,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error || "Failed to add business");
      return;
    }

    if (email) {
      setSuccess(`Business created! Login link sent to ${email}`);
      setTimeout(() => {
        setOpen(false);
        setSuccess("");
        setEmail("");
        setUsername("");
        setPassword("");
      }, 2000);
    } else {
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Business
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Business</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Business Name</Label>
            <Input
              id="name"
              name="name"
              placeholder="Enter business name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              placeholder="Brief description (optional)"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select name="category" defaultValue="food">
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="food">Food</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
                <SelectItem value="services">Services</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username (for login)</Label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="e.g. cafeteria, snackshop"
            />
            <p className="text-xs text-muted-foreground">
              Simple login username (letters, numbers, underscore only)
            </p>
          </div>
          {username && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                minLength={4}
                required={!!username}
              />
              <p className="text-xs text-muted-foreground">
                Password for username login (min 4 characters)
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Business Email (optional)</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@business.com"
            />
            <p className="text-xs text-muted-foreground">
              Optional - for password reset and notifications
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          {success && (
            <p className="text-sm text-green-600">{success}</p>
          )}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Business"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
