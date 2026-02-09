"use client";

import React from "react"

import { useState, useRef } from "react";
import { Upload, X, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { bulkCreateMembers } from "@/app/actions/bulk-create-members";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface BulkMemberRow {
  member_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  business_id: string;
}

export function BulkCreateMembersDialog({ onSuccess }: { onSuccess?: () => void }) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [members, setMembers] = useState<BulkMemberRow[]>([]);
  const [results, setResults] = useState<{
    success: Array<{ code: string; email: string; tempPassword: string }>;
    failed: Array<{ code: string; email: string; error: string }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const csv = event.target?.result as string;
        const lines = csv.split("\n").filter((line) => line.trim());
        const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

        const requiredFields = ["member_code", "first_name", "last_name", "email", "business_id"];
        const missingFields = requiredFields.filter((field) => !headers.includes(field));

        if (missingFields.length > 0) {
          alert(`Missing required columns: ${missingFields.join(", ")}`);
          return;
        }

        const membersList: BulkMemberRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",").map((v) => v.trim());
          const row: BulkMemberRow = {
            member_code: values[headers.indexOf("member_code")],
            first_name: values[headers.indexOf("first_name")],
            last_name: values[headers.indexOf("last_name")],
            email: values[headers.indexOf("email")],
            phone: values[headers.indexOf("phone")] || undefined,
            business_id: values[headers.indexOf("business_id")],
          };

          // Validate required fields
          if (row.member_code && row.first_name && row.last_name && row.email && row.business_id) {
            membersList.push(row);
          }
        }

        if (membersList.length === 0) {
          alert("No valid member records found in the CSV");
          return;
        }

        setMembers(membersList);
        setResults(null);
      } catch (error) {
        alert("Error parsing CSV file: " + (error instanceof Error ? error.message : "Unknown error"));
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (members.length === 0) return;

    setIsLoading(true);
    try {
      const result = await bulkCreateMembers(members);
      setResults(result);

      if (result.success.length > 0) {
        // Show success message with downloadable credentials
        setTimeout(() => {
          if (onSuccess) onSuccess();
        }, 2000);
      }
    } catch (error) {
      alert("Error creating members: " + (error instanceof Error ? error.message : "Unknown error"));
    } finally {
      setIsLoading(false);
    }
  };

  const downloadResults = () => {
    if (!results) return;

    let csv = "Member Code,Email,Temporary Password,Status\n";

    results.success.forEach((item) => {
      csv += `${item.code},${item.email},${item.tempPassword},Success\n`;
    });

    results.failed.forEach((item) => {
      csv += `${item.code},${item.email},,Failed - ${item.error}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-create-members-results-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 bg-transparent">
          <Upload className="w-4 h-4" />
          Bulk Create Accounts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Create Member Accounts</DialogTitle>
          <DialogDescription>
            Upload a CSV file with member details. Required columns: member_code, first_name, last_name, email, business_id
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!results ? (
            <>
              {/* File Upload */}
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-stone-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 text-stone-400" />
                <p className="text-sm font-medium text-stone-700">Click to upload CSV file</p>
                <p className="text-xs text-stone-500 mt-1">or drag and drop</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Preview */}
              {members.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-stone-900">
                      {members.length} member{members.length !== 1 ? "s" : ""} to create
                    </p>
                    <button
                      onClick={() => {
                        setMembers([]);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-xs text-stone-500 hover:text-stone-700"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-stone-100 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left">Code</th>
                          <th className="px-3 py-2 text-left">Name</th>
                          <th className="px-3 py-2 text-left">Email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((member, i) => (
                          <tr key={i} className="border-b hover:bg-stone-50">
                            <td className="px-3 py-2 text-stone-900">{member.member_code}</td>
                            <td className="px-3 py-2 text-stone-700">
                              {member.first_name} {member.last_name}
                            </td>
                            <td className="px-3 py-2 text-stone-600">{member.email}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} disabled={members.length === 0 || isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Accounts"
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
                          {results.success.length} account{results.success.length !== 1 ? "s" : ""} created
                        </p>
                        <p className="text-sm text-emerald-700 mt-1">
                          Welcome emails with temporary passwords have been sent.
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
                              <span className="font-medium">{item.code}:</span> {item.error}
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
                    setMembers([]);
                    setResults(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
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
