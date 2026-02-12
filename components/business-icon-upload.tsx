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
    <div className="space-y-6">
      <div>
        <Label htmlFor="business-icon">Business Icon</Label>
        <p className="text-sm text-muted-foreground mb-3">Upload a custom icon for your business (PNG, JPG, GIF - max 5MB)</p>

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
          {preview && (
            <button
              onClick={handleRemoveIcon}
              disabled={uploading}
              className="text-red-500 hover:text-red-700 disabled:opacity-50 text-sm"
              title="Remove icon"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      {/* Kiosk Preview */}
      {preview && (
        <div className="border rounded-lg p-6 bg-slate-50">
          <p className="text-sm font-medium text-slate-700 mb-4">Kiosk Preview</p>
          <div className="flex gap-6">
            {/* Favorite businesses style */}
            <div className="flex flex-col items-center">
              <p className="text-xs text-slate-500 mb-3">Favorites Section</p>
              <button className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4 flex flex-col items-center gap-2 border border-emerald-200 w-24">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center overflow-hidden">
                  <Image
                    src={preview}
                    alt={businessName}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
                <p className="font-medium text-stone-900 text-center text-xs line-clamp-2 max-w-[80px]">
                  {businessName}
                </p>
              </button>
            </div>

            {/* All businesses style */}
            <div className="flex flex-col items-center">
              <p className="text-xs text-slate-500 mb-3">All Businesses Section</p>
              <button className="bg-white rounded-xl p-4 flex flex-col items-center gap-2 border border-stone-200 w-24">
                <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center overflow-hidden">
                  <Image
                    src={preview}
                    alt={businessName}
                    width={40}
                    height={40}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                </div>
                <p className="font-medium text-stone-900 text-center text-xs line-clamp-2 max-w-[80px]">
                  {businessName}
                </p>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
