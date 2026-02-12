"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import { Upload, X } from "lucide-react";
import { put, del } from "@vercel/blob";

interface BusinessIconUploadProps {
  businessId: string;
  businessName: string;
  currentIconUrl?: string | null;
  onUploadSuccess: (iconUrl: string) => void;
  onUploadError: (error: string) => void;
}

export function BusinessIconUpload({
  businessId,
  businessName,
  currentIconUrl,
  onUploadSuccess,
  onUploadError,
}: BusinessIconUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentIconUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      onUploadError("Please select an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      onUploadError("Image must be less than 5MB");
      return;
    }

    setUploading(true);

    try {
      // Create a preview URL
      const previewUrl = URL.createObjectURL(file);
      setPreview(previewUrl);

      // Upload to Vercel Blob
      const blob = await put(`business-icons/${businessId}/${file.name}`, file, {
        access: "public",
        addRandomSuffix: true,
      });

      onUploadSuccess(blob.url);
    } catch (error) {
      console.error("[v0] Upload error:", error);
      onUploadError(error instanceof Error ? error.message : "Failed to upload image");
      setPreview(currentIconUrl || null);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveIcon = async () => {
    if (!currentIconUrl) return;

    setUploading(true);
    try {
      // Delete from Vercel Blob
      await del(currentIconUrl);
      setPreview(null);
      onUploadSuccess("");
    } catch (error) {
      console.error("[v0] Delete error:", error);
      onUploadError(error instanceof Error ? error.message : "Failed to remove image");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="business-icon">Business Icon</Label>
        <p className="text-sm text-muted-foreground mb-3">Upload a custom icon for your business (PNG, JPG, GIF - max 5MB)</p>

        {preview && (
          <div className="mb-4 relative inline-block">
            <div className="w-24 h-24 relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
              <Image
                src={preview}
                alt={businessName}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
            <button
              onClick={handleRemoveIcon}
              disabled={uploading}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 disabled:opacity-50"
              title="Remove icon"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
            id="business-icon"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            {uploading ? "Uploading..." : "Choose Image"}
          </Button>
        </div>
      </div>
    </div>
  );
}
