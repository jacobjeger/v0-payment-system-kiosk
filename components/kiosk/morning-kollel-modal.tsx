"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { logMorningKollel, getMorningKollelStats } from "@/app/actions/morning-kollel";
import { Coffee, BarChart3 } from "lucide-react";

interface MorningKollelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function MorningKollelModal({ isOpen, onClose, onSuccess }: MorningKollelModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<any>(null);

  const handleConfirm = async () => {
    setIsLoading(true);
    console.log("[v0] Logging morning kollel...");
    
    try {
      const result = await logMorningKollel();
      console.log("[v0] Log result:", result);
      
      if (result.success) {
        // Show stats after successful log
        const statsResult = await getMorningKollelStats();
        console.log("[v0] Stats result:", statsResult);
        
        if (statsResult.success) {
          setStats(statsResult.stats);
          setShowStats(true);
        }
        onSuccess?.();
      } else {
        console.error("[v0] Failed to log:", result.error);
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error("[v0] Error in handleConfirm:", error);
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        {!showStats ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Coffee className="w-5 h-5" />
                Log Morning Kollel Coffee
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to log one coffee consumption?
              </DialogDescription>
            </DialogHeader>

            <div className="py-8">
              <p className="text-center text-sm text-muted-foreground mb-4">
                This will increment today's tally by one.
              </p>
            </div>

            <DialogFooter className="flex gap-2 sm:justify-between">
              <Button variant="outline" onClick={onClose} disabled={isLoading}>
                Cancel
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowStats(true)}
                  disabled={isLoading}
                  className="text-xs"
                >
                  <BarChart3 className="w-4 h-4 mr-1" />
                  View Stats
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {isLoading ? "Logging..." : "Confirm & Log"}
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Morning Kollel Statistics
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground mb-1">Today</p>
                <p className="text-3xl font-bold text-blue-600">{stats?.today || 0}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-purple-50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">This Week</p>
                  <p className="text-2xl font-bold text-purple-600">{stats?.week || 0}</p>
                </div>

                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">This Month</p>
                  <p className="text-2xl font-bold text-green-600">{stats?.month || 0}</p>
                </div>
              </div>

              <div className="text-xs text-center text-muted-foreground mt-4">
                Last logged: {stats?.allLogs?.[0]?.logged_date || "Never"}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowStats(false)}
                className="w-full"
              >
                Back
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
