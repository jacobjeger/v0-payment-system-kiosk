"use client";

import React from "react";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { bulkAddMembers } from "@/app/actions/admin";

interface ParsedMember {
  rowNumber: number;
  firstName: string;
  lastName: string;
  email: string;
  cardNumber: string;
  cardExp: string;
  cardCvv: string;
  pinCode: string;
  isComplete: boolean;
  missingFields: string[];
}

interface UploadResult {
  success: number;
  failed: number;
  errors: string[];
}

export function BulkUploadDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedMember[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [headerError, setHeaderError] = useState("");
  const [parseError, setParseError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validMembers = parsedData.filter(m => m.isComplete);
  const invalidMembers = parsedData.filter(m => !m.isComplete);
  const completeMembers = validMembers;
  const incompleteMembers = invalidMembers;

  const downloadTemplate = () => {
    const headers = "first_name,last_name,email,card_number,card_exp,card_cvv";
    const example1 = "John,Doe,john@example.com,4111111111111234,12/26,123";
    const example2 = "Jane,Smith,jane@example.com,4222222222225678,06/27,456";
    const csvContent = `${headers}\n${example1}\n${example2}`;
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "member_upload_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const parseCSV = (text: string): { members: ParsedMember[]; headerError?: string } => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      return { members: [], headerError: "CSV must have a header row and at least one data row" };
    }

    const header = lines[0].toLowerCase().split(",").map(h => h.trim());
    const requiredFields = ["first_name", "last_name", "email", "card_number", "card_exp", "card_cvv"];
    
    const missingFields = requiredFields.filter(field => !header.includes(field));
    if (missingFields.length > 0) {
      return { members: [], headerError: `Missing required columns: ${missingFields.join(", ")}` };
    }

    const members: ParsedMember[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(",").map(v => v.trim());
      
      const cardNumber = values[header.indexOf("card_number")] || "";
      const pinCode = cardNumber.slice(-4);
      
const missingFields: string[] = [];
      
      // Check what's missing
      if (!values[header.indexOf("first_name")]?.trim()) missingFields.push("First Name");
      if (!values[header.indexOf("last_name")]?.trim()) missingFields.push("Last Name");
      if (!values[header.indexOf("email")]?.trim()) missingFields.push("Email");
      if (!cardNumber || cardNumber.replace(/\s/g, "").length < 13) missingFields.push("Card Number");
      if (!values[header.indexOf("card_exp")]?.trim() || !values[header.indexOf("card_exp")]?.includes("/")) missingFields.push("Exp Date");
      if (!values[header.indexOf("card_cvv")]?.trim() || values[header.indexOf("card_cvv")]?.length < 3) missingFields.push("CVV");

      const member: ParsedMember = {
        rowNumber: i + 1,
        firstName: values[header.indexOf("first_name")] || "",
        lastName: values[header.indexOf("last_name")] || "",
        email: values[header.indexOf("email")] || "",
        cardNumber: cardNumber,
        cardExp: values[header.indexOf("card_exp")] || "",
        cardCvv: values[header.indexOf("card_cvv")] || "",
        pinCode: pinCode,
        isComplete: missingFields.length === 0,
        missingFields: missingFields,
      };

      members.push(member);
    }

    return { members };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setHeaderError("");
    setParsedData([]);
    setResult(null);
    
    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (!selectedFile.name.endsWith(".csv")) {
      setHeaderError("Please upload a CSV file");
      setFile(null);
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { members, headerError: hError } = parseCSV(text);
      if (hError) {
        setHeaderError(hError);
        setParsedData([]);
      } else {
        setParsedData(members);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleUpload = async () => {
    if (parsedData.length === 0) return;

    setUploading(true);
    setResult(null);

    try {
      const membersToUpload = parsedData.map(m => ({
        firstName: m.firstName,
        lastName: m.lastName,
        email: m.email,
        cardNumber: m.cardNumber,
        cardExp: m.cardExp,
        cardCvv: m.cardCvv,
        pinCode: m.pinCode,
      }));
      const response = await bulkAddMembers(membersToUpload);
      setResult(response);
      
      if (response.success > 0) {
        setTimeout(() => {
          if (response.failed === 0) {
            setOpen(false);
            setFile(null);
            setParsedData([]);
            setResult(null);
          }
        }, 2000);
      }
    } catch {
      setResult({
        success: 0,
        failed: parsedData.length,
        errors: ["An unexpected error occurred"],
      });
    } finally {
      setUploading(false);
    }
  };

const resetForm = () => {
    setFile(null);
    setParsedData([]);
    setResult(null);
    setHeaderError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Upload Members</DialogTitle>
          <DialogDescription>
            Upload a CSV file to add multiple members at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 overflow-y-auto flex-1">
          {/* Download Template */}
          <div className="bg-muted/50 border border-border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Download Template</p>
                <p className="text-sm text-muted-foreground">
                  Use this template to format your member data correctly
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download CSV
              </Button>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Upload CSV File
            </label>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" className="cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-muted-foreground mb-3">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="12" y1="18" x2="12" y2="12"/>
                  <line x1="9" y1="15" x2="15" y2="15"/>
                </svg>
                {file ? (
                  <p className="text-foreground font-medium">{file.name}</p>
                ) : (
                  <p className="text-muted-foreground">
                    Click to select a CSV file or drag and drop
                  </p>
                )}
              </label>
            </div>
          </div>

          {/* Header Error */}
          {headerError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
              <p className="text-sm text-destructive font-medium">{headerError}</p>
            </div>
          )}

{/* Members Preview */}
          {parsedData.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  Preview ({parsedData.length} members)
                </p>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    {completeMembers.length} complete
                  </span>
                  {incompleteMembers.length > 0 && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      {incompleteMembers.length} missing data
                    </span>
                  )}
                </div>
              </div>
              <div className="border border-border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Row</th>
                      <th className="text-left px-3 py-2 font-medium">Name</th>
                      <th className="text-left px-3 py-2 font-medium">Email</th>
                      <th className="text-left px-3 py-2 font-medium">Card</th>
                      <th className="text-left px-3 py-2 font-medium">PIN</th>
                      <th className="text-left px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.map((member, i) => (
                      <tr key={i} className={`border-t border-border ${!member.isComplete ? 'bg-amber-50' : ''}`}>
                        <td className="px-3 py-2 text-muted-foreground">{member.rowNumber}</td>
                        <td className="px-3 py-2">
                          {member.firstName || member.lastName 
                            ? `${member.firstName} ${member.lastName}`.trim() 
                            : <span className="text-muted-foreground italic">-</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {member.email || <span className="italic">-</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {member.cardNumber && member.cardNumber.length >= 4 
                            ? `****${member.cardNumber.slice(-4)}` 
                            : <span className="text-muted-foreground italic">-</span>}
                        </td>
                        <td className="px-3 py-2 font-mono">
                          {member.pinCode || <span className="text-muted-foreground italic">-</span>}
                        </td>
                        <td className="px-3 py-2">
                          {member.isComplete ? (
                            <span className="inline-flex items-center gap-1 text-green-700 text-xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                              Complete
                            </span>
                          ) : (
                            <span className="text-amber-600 text-xs" title={member.missingFields.join(", ")}>
                              Missing: {member.missingFields.join(", ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Invalid Members Preview */}
          {invalidMembers.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-700 text-xs font-bold">{invalidMembers.length}</span>
                Skipped (Missing Data)
              </p>
              <div className="border border-red-200 rounded-lg overflow-hidden max-h-36 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-red-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-red-800">Row</th>
                      <th className="text-left px-3 py-2 font-medium text-red-800">Data</th>
                      <th className="text-left px-3 py-2 font-medium text-red-800">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invalidMembers.map((member, i) => (
                      <tr key={i} className="border-t border-red-100">
                        <td className="px-3 py-2 text-muted-foreground">{member.rowNumber}</td>
                        <td className="px-3 py-2">
                          {member.firstName || member.lastName 
                            ? `${member.firstName} ${member.lastName}`.trim() 
                            : member.email || "(empty)"}
                        </td>
                        <td className="px-3 py-2 text-red-600">{member.missingFields.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload Result */}
          {result && (
            <div className={`rounded-lg p-4 ${
              result.failed === 0 
                ? "bg-green-50 border border-green-200" 
                : result.success === 0 
                  ? "bg-destructive/10 border border-destructive/20"
                  : "bg-yellow-50 border border-yellow-200"
            }`}>
              <p className={`font-medium ${
                result.failed === 0 
                  ? "text-green-700" 
                  : result.success === 0 
                    ? "text-destructive"
                    : "text-yellow-700"
              }`}>
                {result.success} members added successfully
                {result.failed > 0 && `, ${result.failed} failed`}
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 text-sm text-destructive space-y-1">
                  {result.errors.slice(0, 5).map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                  {result.errors.length > 5 && (
                    <li>... and {result.errors.length - 5} more errors</li>
                  )}
                </ul>
              )}
            </div>
          )}

          </div>

        {/* Actions - Fixed Footer */}
        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-auto shrink-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={parsedData.length === 0 || uploading}
          >
            {uploading ? (
              <>
                <svg className="animate-spin mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Uploading...
              </>
            ) : (
              `Upload ${parsedData.length} Member${parsedData.length !== 1 ? 's' : ''}`
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
