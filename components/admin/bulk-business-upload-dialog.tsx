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
import { bulkAddBusinesses } from "@/app/actions/admin";
import { Upload, Download, FileText, Loader2 } from "lucide-react";

interface ParsedBusiness {
  name: string;
  description?: string;
  category?: string;
  email?: string;
  feePercentage?: number;
}

interface UploadResult {
  success: number;
  failed: number;
  errors: string[];
}

export function BulkBusinessUploadDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedBusiness[]>([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [parseError, setParseError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const headers = "name,description,category,email,fee_percentage";
    const example1 = "Main Cafeteria,Breakfast and lunch service,food,cafe@example.com,5";
    const example2 = "Seforim Store,Books and judaica,retail,books@example.com,3";
    const example3 = "Coffee Shop,Hot and cold beverages,food,coffee@example.com,4";
    const csvContent = `${headers}\n${example1}\n${example2}\n${example3}`;
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "business_upload_template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const parseCSV = (text: string): ParsedBusiness[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) {
      throw new Error("CSV must have a header row and at least one data row");
    }

    const header = lines[0].toLowerCase().split(",").map(h => h.trim());
    
    if (!header.includes("name")) {
      throw new Error("Missing required column: name");
    }

    const businesses: ParsedBusiness[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(",").map(v => v.trim());
      
      const biz: ParsedBusiness = {
        name: values[header.indexOf("name")] || "",
        description: header.includes("description") ? values[header.indexOf("description")] || undefined : undefined,
        category: header.includes("category") ? values[header.indexOf("category")] || "food" : "food",
        email: header.includes("email") ? values[header.indexOf("email")] || undefined : undefined,
        feePercentage: header.includes("fee_percentage") ? parseFloat(values[header.indexOf("fee_percentage")]) || 0 : 0,
      };

      if (!biz.name) {
        throw new Error(`Row ${i + 1}: Missing required field (name)`);
      }

      businesses.push(biz);
    }

    return businesses;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setParseError("");
    setParsedData([]);
    setResult(null);
    
    if (!selectedFile) {
      setFile(null);
      return;
    }

    if (!selectedFile.name.endsWith(".csv")) {
      setParseError("Please upload a CSV file");
      setFile(null);
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);
        setParsedData(parsed);
      } catch (error) {
        setParseError(error instanceof Error ? error.message : "Failed to parse CSV");
        setParsedData([]);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleUpload = async () => {
    if (parsedData.length === 0) return;

    setUploading(true);
    setResult(null);

    try {
      const response = await bulkAddBusinesses(parsedData);
      setResult(response);
      
      if (response.success > 0 && response.failed === 0) {
        setTimeout(() => {
          setOpen(false);
          resetForm();
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
    setParseError("");
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
          <Upload className="w-4 h-4 mr-2" />
          Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Upload Businesses</DialogTitle>
          <DialogDescription>
            Upload a CSV file to add multiple businesses at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Download Template */}
          <div className="bg-stone-50 border border-stone-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-stone-900">Download Template</p>
                <p className="text-sm text-stone-500">
                  Use this template to format your business data correctly
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="w-4 h-4 mr-2" />
                Download CSV
              </Button>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-stone-900 mb-2">
              Upload CSV File
            </label>
            <div className="border-2 border-dashed border-stone-300 rounded-lg p-6 text-center hover:border-stone-400 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
                id="business-csv-upload"
              />
              <label htmlFor="business-csv-upload" className="cursor-pointer">
                <FileText className="w-10 h-10 mx-auto text-stone-400 mb-3" />
                {file ? (
                  <p className="text-stone-900 font-medium">{file.name}</p>
                ) : (
                  <p className="text-stone-500">
                    Click to select a CSV file or drag and drop
                  </p>
                )}
              </label>
            </div>
          </div>

          {/* Parse Error */}
          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-700 font-medium">{parseError}</p>
            </div>
          )}

          {/* Preview */}
          {parsedData.length > 0 && (
            <div>
              <p className="text-sm font-medium text-stone-900 mb-2">
                Preview ({parsedData.length} businesses found)
              </p>
              <div className="border border-stone-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-stone-900">Name</th>
                      <th className="text-left px-3 py-2 font-medium text-stone-900">Category</th>
                      <th className="text-left px-3 py-2 font-medium text-stone-900">Email</th>
                      <th className="text-left px-3 py-2 font-medium text-stone-900">Fee %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 10).map((biz, i) => (
                      <tr key={i} className="border-t border-stone-200">
                        <td className="px-3 py-2 font-medium text-stone-900">{biz.name}</td>
                        <td className="px-3 py-2 text-stone-600 capitalize">{biz.category}</td>
                        <td className="px-3 py-2 text-stone-500">{biz.email || "-"}</td>
                        <td className="px-3 py-2 text-stone-600">{biz.feePercentage}%</td>
                      </tr>
                    ))}
                    {parsedData.length > 10 && (
                      <tr className="border-t border-stone-200 bg-stone-50">
                        <td colSpan={4} className="px-3 py-2 text-center text-stone-500">
                          ... and {parsedData.length - 10} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Upload Result */}
          {result && (
            <div className={`rounded-lg p-4 ${
              result.failed === 0 
                ? "bg-emerald-50 border border-emerald-200" 
                : result.success === 0 
                  ? "bg-red-50 border border-red-200"
                  : "bg-amber-50 border border-amber-200"
            }`}>
              <p className={`font-medium ${
                result.failed === 0 
                  ? "text-emerald-700" 
                  : result.success === 0 
                    ? "text-red-700"
                    : "text-amber-700"
              }`}>
                {result.success} businesses added successfully
                {result.failed > 0 && `, ${result.failed} failed`}
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 text-sm text-red-600 space-y-1">
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

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-stone-200">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={parsedData.length === 0 || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                `Upload ${parsedData.length} Businesses`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
