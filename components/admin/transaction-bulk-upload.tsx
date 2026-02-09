"use client";

import React from "react"

import { useState } from "react";
import { Upload, Download, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { bulkUploadTransactions } from "@/app/actions/bulk-transactions";

interface TransactionBulkUploadProps {
  cycleId?: string;
  onSuccess?: () => void;
}

export function TransactionBulkUpload({ cycleId, onSuccess }: TransactionBulkUploadProps) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    inserted: number;
    errors: Array<{ row: number; error: string; data: any }>;
    message?: string;
  } | null>(null);

  const downloadTemplate = (format: "wide" | "narrow" = "wide") => {
    let template: string;
    
    if (format === "wide") {
      // Wide format: Last Name, First Name, Total, then business columns
      template = `Last Name,First Name,Total,Acai Bowls,Red bull,Biltong,Candy Platters,Coffee
Goldschmidt,Yitzi,57.00,10.00,5.00,15.00,12.00,15.00
Abish,Daniel,25.00,0,5.00,0,20.00,0
Jeger,Akiva,30.50,15.00,0,15.50,0,0`;
    } else {
      // Narrow format: Member Code, Business Name, Amount, Description
      template = `Member Code,Business Name,Amount,Description
MEMBR123,Acai Bowls,10.00,Acai Bowl
MEMBR456,Red bull,5.00,Red Bull Can
MEMBR789,Biltong,15.50,Biltong Pack`;
    }
    
    const blob = new Blob([template], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transaction_upload_template_${format}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);

    try {
      const text = await file.text();
      const uploadResult = await bulkUploadTransactions(text, cycleId);
      setResult(uploadResult);
      
      if (uploadResult.success && uploadResult.errors.length === 0) {
        setTimeout(() => {
          setOpen(false);
          setResult(null);
          onSuccess?.();
        }, 2000);
      }
    } catch (error) {
      setResult({
        success: false,
        inserted: 0,
        errors: [],
        message: error instanceof Error ? error.message : "Upload failed",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-transparent">
          <Upload className="w-4 h-4 mr-2" />
          Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Upload Transactions</DialogTitle>
          <DialogDescription>
            Upload multiple transactions at once using a CSV file
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-medium mb-2">CSV Format Options</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Choose your preferred upload format:
            </p>
            
            {/* Wide Format */}
            <div className="mb-4 pb-4 border-b">
              <p className="text-sm font-medium mb-2">Wide Format (Recommended)</p>
              <p className="text-xs text-muted-foreground mb-2">
                One row per member with columns for each business
              </p>
              <div className="text-xs font-mono bg-background p-3 rounded border mb-3 overflow-x-auto">
                Last Name, First Name, Total, Business1, Business2, Business3...
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadTemplate("wide")}
                className="bg-transparent"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Wide Format Template
              </Button>
            </div>

            {/* Narrow Format */}
            <div>
              <p className="text-sm font-medium mb-2">Narrow Format</p>
              <p className="text-xs text-muted-foreground mb-2">
                One row per transaction (member code required)
              </p>
              <div className="text-xs font-mono bg-background p-3 rounded border mb-3">
                Member Code, Business Name, Amount, Description
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadTemplate("narrow")}
                className="bg-transparent"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Narrow Format Template
              </Button>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label htmlFor="transaction-csv-upload" className="block mb-2 text-sm font-medium">
              Upload CSV File
            </label>
            <input
              id="transaction-csv-upload"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              disabled={uploading}
              className="block w-full text-sm text-muted-foreground
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-medium
                file:bg-primary file:text-primary-foreground
                hover:file:bg-primary/90
                file:cursor-pointer cursor-pointer
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Upload Status */}
          {uploading && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Processing your file, please wait...
              </AlertDescription>
            </Alert>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-3">
              <Alert variant={result.success && result.errors.length === 0 ? "default" : "destructive"}>
                {result.success && result.errors.length === 0 ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertCircle className="h-4 w-4" />
                )}
                <AlertDescription>{result.message}</AlertDescription>
              </Alert>

              {result.errors.length > 0 && (
                <div className="max-h-60 overflow-y-auto border rounded-lg p-4 space-y-2">
                  <h4 className="font-medium text-sm mb-2">
                    Errors ({result.errors.length}):
                  </h4>
                  {result.errors.map((error, idx) => (
                    <div
                      key={idx}
                      className="text-xs bg-destructive/10 p-2 rounded"
                    >
                      <span className="font-medium">Row {error.row}:</span> {error.error}
                      <div className="text-muted-foreground mt-1">
                        Member: {error.data.memberCode}, Business: {error.data.businessName}, Amount: ₪{error.data.amount}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Instructions */}
          <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
            <p className="font-medium text-foreground mb-2">Requirements:</p>
            <p>• Member codes must match existing members in the system</p>
            <p>• Business names must match existing businesses exactly (case-insensitive)</p>
            <p>• Amounts must be positive numbers</p>
            <p>• Transactions will be added to the {cycleId ? "selected" : "active"} billing cycle</p>
            <p>• Member balances will be automatically updated</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
