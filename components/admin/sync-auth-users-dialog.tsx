"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Link2, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { syncAuthUsersToMembers } from "@/app/actions/sync-auth-users";

export function SyncAuthUsersDialog() {
  const [open, setOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{
    synced: number;
    failed: number;
    message?: string;
  } | null>(null);

  async function handleSync() {
    if (!confirm("Link existing auth users to member profiles? This will match users by email address.")) {
      return;
    }

    setSyncing(true);
    setResult(null);

    try {
      const response = await syncAuthUsersToMembers();

      if (response.success) {
        setResult({
          synced: response.synced,
          failed: response.failed,
          message: response.message,
        });
      } else {
        setResult({
          synced: 0,
          failed: 0,
          message: `Error: ${response.error}`,
        });
      }
    } catch (err) {
      setResult({
        synced: 0,
        failed: 0,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    setSyncing(false);
  }

  function handleClose() {
    setOpen(false);
    setResult(null);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Link2 className="w-4 h-4 mr-2" />
          Sync Auth Users
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sync Auth Users to Members</DialogTitle>
          <DialogDescription>
            Link existing Supabase Auth users to member profiles by matching email addresses. This fixes members who have accounts but aren't linked properly.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will search for members without linked accounts and match them with existing auth users by email.
            </p>
            <Button
              onClick={handleSync}
              disabled={syncing}
              className="w-full"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 mr-2" />
                  Start Sync
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {result.message && (
              <p className="text-sm text-muted-foreground">{result.message}</p>
            )}
            
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="font-medium">{result.synced} member(s) synced successfully</span>
              </div>
              
              {result.failed > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span className="font-medium">{result.failed} member(s) failed to sync</span>
                </div>
              )}
            </div>

            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
