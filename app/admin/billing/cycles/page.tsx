"use client";

import React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronRight, 
  Plus, 
  AlertCircle, 
  Calendar, 
  PlayCircle, 
  CheckCircle2, 
  FileText,
  Loader2,
  ArrowRight,
  Clock,
  Zap,
  Trash2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import type { BillingCycle } from "@/lib/types";

// Format date without timezone conversion (prevents day shift issues)
function formatDateUTC(dateString: string, options?: { month?: 'short' | 'long' | 'numeric'; day?: 'numeric' | '2-digit'; year?: 'numeric' | '2-digit' }) {
  const [year, month, day] = dateString.split('T')[0].split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = parseInt(month, 10) - 1;
  
  if (options?.year) {
    return `${monthNames[monthIndex]} ${parseInt(day, 10)}, ${year}`;
  }
  return `${monthNames[monthIndex]} ${parseInt(day, 10)}`;
}

import {
  createBillingCycle,
  closeBillingCycle,
  deleteBillingCycle,
} from "@/app/actions/billing";

export default function BillingCyclesPage() {
  const router = useRouter();
  const [cycles, setCycles] = useState<BillingCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cycleToDelete, setCycleToDelete] = useState<BillingCycle | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Check if there's an active cycle
  const activeCycle = cycles.find(c => c.status === "active");
  const closedCycles = cycles.filter(c => c.status === "closed");
  const invoicedCycles = cycles.filter(c => c.status === "invoiced");

  // Filter cycles by search
  const filteredCycles = cycles.filter(c => 
    !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    loadCycles();
    // Generate default name
    const now = new Date();
    const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    setName(monthName);
  }, []);

  async function loadCycles() {
    const supabase = createClient();
    const { data } = await supabase
      .from("billing_cycles")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setCycles(data);
    setLoading(false);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");

    const result = await createBillingCycle({ name });

    if (!result.success) {
      setError(result.error || "Failed to create billing cycle");
    } else {
      const message = result.closedPreviousCycle 
        ? "New cycle created. Previous cycle has been closed and invoices generated."
        : "Billing cycle created successfully";
      setSuccess(message);
      setCreateOpen(false);
      
      // Reset name to next month
      const now = new Date();
      now.setMonth(now.getMonth() + 1);
      const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      setName(monthName);
      
      loadCycles();
      
      // If we closed a previous cycle, navigate to it
      if (result.closedPreviousCycle && activeCycle) {
        setTimeout(() => {
          router.push(`/admin/billing/cycles/${activeCycle.id}`);
        }, 1500);
      }
      
      setTimeout(() => setSuccess(""), 5000);
    }

    setCreating(false);
  }

  async function handleCloseCycle(cycleId: string) {
    const result = await closeBillingCycle(cycleId);
    if (result.success) {
      loadCycles();
      router.push(`/admin/billing/cycles/${cycleId}`);
    }
  }

  async function handleDeleteCycle() {
    if (!cycleToDelete) return;
    setDeleting(true);
    
    const result = await deleteBillingCycle(cycleToDelete.id);
    
    if (result.success) {
      loadCycles();
      setDeleteDialogOpen(false);
      setCycleToDelete(null);
    } else {
      setError(result.error || "Failed to delete cycle");
    }
    
    setDeleting(false);
  }

  function openDeleteDialog(e: React.MouseEvent, cycle: BillingCycle) {
    e.stopPropagation();
    setCycleToDelete(cycle);
    setDeleteDialogOpen(true);
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500 hover:bg-green-500">Active</Badge>;
      case "closed":
        return <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">Ready to Invoice</Badge>;
      case "invoiced":
        return <Badge className="bg-blue-500 hover:bg-blue-500">Invoiced</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Billing Cycles</h1>
        <p className="text-muted-foreground">
          Manage billing periods and send invoices to members
        </p>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          {success}
        </div>
      )}

      {/* Quick Actions Section */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Current Cycle Status */}
        <Card className={activeCycle ? "border-green-200 bg-green-50/30" : "border-dashed"}>
          <CardHeader>
            <div className="flex items-center gap-2">
              {activeCycle ? (
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              ) : (
                <Clock className="w-4 h-4 text-muted-foreground" />
              )}
              <CardTitle className="text-lg">
                {activeCycle ? "Current Active Cycle" : "No Active Cycle"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {activeCycle ? (
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-bold">{activeCycle.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Started {formatDateUTC(activeCycle.start_date, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => router.push(`/admin/billing/cycles/${activeCycle.id}`)}
                  >
                    View Details
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                  <Button 
                    size="sm"
                    onClick={() => handleCloseCycle(activeCycle.id)}
                  >
                    Close & Generate Invoices
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Create a new billing cycle to start tracking transactions.
                </p>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Start New Cycle
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Start New Cycle */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-600" />
              <CardTitle className="text-lg">Start New Cycle</CardTitle>
            </div>
            <CardDescription>
              {activeCycle 
                ? "This will close the current cycle and generate invoices automatically"
                : "Begin a new billing period to track transactions"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cycleName">Cycle Name</Label>
                <Input
                  id="cycleName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., January 2026"
                  required
                />
              </div>
              
              {activeCycle && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700">
                    "{activeCycle.name}" will be closed and invoices generated
                  </p>
                </div>
              )}
              
              {error && <p className="text-sm text-destructive">{error}</p>}
              
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    {activeCycle ? "Close Current & Start New" : "Create Cycle"}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Cycles Ready for Invoicing */}
      {closedCycles.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-600" />
                <CardTitle>Ready for Invoicing</CardTitle>
              </div>
              <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                {closedCycles.length} cycle{closedCycles.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <CardDescription>
              These cycles are closed and ready to send invoices to members
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {closedCycles.map((cycle) => (
                <div 
                  key={cycle.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-amber-50 border border-amber-100 hover:border-amber-300 transition-colors cursor-pointer"
                  onClick={() => router.push(`/admin/billing/cycles/${cycle.id}`)}
                >
                  <div>
                    <p className="font-medium">{cycle.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateUTC(cycle.start_date)} - {formatDateUTC(cycle.end_date)}
                    </p>
                  </div>
                  <Button size="sm">
                    Review & Send Invoices
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Cycles History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-muted-foreground" />
              <CardTitle>Cycle History</CardTitle>
            </div>
            <Input
              placeholder="Search cycles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <CardDescription>
            View all past and current billing cycles
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCycles.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "No cycles match your search" : "No billing cycles yet"}
              </p>
              {!searchQuery && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Cycle
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCycles.map((cycle) => (
                <div 
                  key={cycle.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer group"
                  onClick={() => router.push(`/admin/billing/cycles/${cycle.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      cycle.status === "active" ? "bg-green-100" :
                      cycle.status === "closed" ? "bg-amber-100" : "bg-blue-100"
                    }`}>
                      {cycle.status === "active" ? (
                        <PlayCircle className="w-5 h-5 text-green-600" />
                      ) : cycle.status === "closed" ? (
                        <FileText className="w-5 h-5 text-amber-600" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{cycle.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateUTC(cycle.start_date)}
                        {cycle.status !== "active" && (
                          <> - {formatDateUTC(cycle.end_date, { year: 'numeric' })}</>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(cycle.status)}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => openDeleteDialog(e, cycle)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Billing Cycle</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{cycleToDelete?.name}"? This will permanently delete all associated invoices, transactions, cash payments, and disputes. Member balances will be recalculated. This action cannot be undone.
              </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCycle}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Cycle"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Dialog (for mobile/fallback) */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Billing Cycle</DialogTitle>
            <DialogDescription>
              Start a new billing period. This will automatically close the current active cycle and generate invoices.
            </DialogDescription>
          </DialogHeader>
          
          {activeCycle && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Active Cycle Will Be Closed</p>
                <p className="text-sm text-amber-700 mt-1">
                  The current cycle "{activeCycle.name}" will be closed and invoices will be generated automatically.
                </p>
              </div>
            </div>
          )}
          
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Cycle Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., January 2026"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : activeCycle ? "Close Current & Create New" : "Create Cycle"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
