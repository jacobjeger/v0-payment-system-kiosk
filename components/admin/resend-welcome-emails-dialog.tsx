"use client";

import { useState } from "react";
import { Mail, X, AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { resendWelcomeEmails } from "@/app/actions/resend-welcome-emails";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Member } from "@/lib/types";

interface ResendEmailResult {
  success: Array<{ member_id: string; name: string; email: string; tempPassword: string }>;
  failed: Array<{ member_id: string; name: string; error: string }>;
}

interface ResendWelcomeEmailsDialogProps {
  members: Member[];
}

export function ResendWelcomeEmailsDialog({ members }: ResendWelcomeEmailsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [results, setResults] = useState<ResendEmailResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter members who have accounts (user_id exists)
  const eligibleMembers = members.filter(
    (m) => m.user_id && m.is_active !== false && m.email
  );

  const filteredMembers = eligibleMembers.filter((m) =>
    `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectAll = () => {
    if (selectedMembers.length === filteredMembers.length) {
      setSelectedMembers([]);
    } else {
      setSelectedMembers(filteredMembers.map((m) => m.id));
    }
  };

  const handleToggleMember = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const handleSubmit = async () => {
    if (selectedMembers.length === 0) return;

    setIsLoading(true);
    try {
      const membersToEmail = eligibleMembers.filter((m) =>
        selectedMembers.includes(m.id)
      );

      const result = await resendWelcomeEmails(membersToEmail);
      setResults(result);
    } catch (error) {
      alert("Error resending emails: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  const downloadResults = () => {
    if (!results) return;

    let csv = "Member Name,Email,New Temporary Password,Status\n";

    results.success.forEach((item) => {
      csv += `${item.name},${item.email},${item.tempPassword},Success\n`;
    });

    results.failed.forEach((item) => {
      csv += `${item.name},,Failed - ${item.error}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resend-welcome-emails-results-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 bg-transparent">
          <RefreshCw className="w-4 h-4" />
          Resend Welcome Emails
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Resend Welcome Emails</DialogTitle>
          <DialogDescription>
            Select members to resend welcome emails to. They will receive new temporary passwords.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto flex flex-col gap-4">
          {!results ? (
            <>
              {/* Search */}
              <input
                type="text"
                placeholder="Search members by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10"
              />

              {/* Member Selection */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-stone-50 border-b px-4 py-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      selectedMembers.length === filteredMembers.length &&
                      filteredMembers.length > 0
                    }
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-stone-300"
                  />
                  <span className="text-sm font-medium text-stone-700">
                    {selectedMembers.length > 0
                      ? `${selectedMembers.length} selected`
                      : `${filteredMembers.length} available`}
                  </span>
                </div>

                <div className="max-h-64 overflow-y-auto divide-y">
                  {filteredMembers.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-stone-500">
                      {eligibleMembers.length === 0
                        ? "No members with accounts found"
                        : "No members match your search"}
                    </div>
                  ) : (
                    filteredMembers.map((member) => (
                      <label
                        key={member.id}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedMembers.includes(member.id)}
                          onChange={() => handleToggleMember(member.id)}
                          className="w-4 h-4 rounded border-stone-300"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-900">
                            {member.first_name} {member.last_name}
                          </p>
                          <p className="text-xs text-stone-500 truncate">{member.email}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={selectedMembers.length === 0 || isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Resend Emails
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Results */}
              <div className="space-y-3">
                {results.success.length > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-emerald-900">
                          {results.success.length} email{results.success.length !== 1 ? "s" : ""} sent successfully
                        </p>
                        <p className="text-sm text-emerald-700 mt-1">
                          New temporary passwords have been generated and sent.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {results.failed.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-red-900">
                          {results.failed.length} error{results.failed.length !== 1 ? "s" : ""}
                        </p>
                        <div className="text-sm text-red-700 mt-2 max-h-32 overflow-y-auto space-y-1">
                          {results.failed.map((item, i) => (
                            <p key={i}>
                              <span className="font-medium">{item.name}:</span> {item.error}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => downloadResults()}>
                  Download Results
                </Button>
                <Button
                  onClick={() => {
                    setOpen(false);
                    setSelectedMembers([]);
                    setResults(null);
                    setSearchQuery("");
                  }}
                >
                  Done
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
