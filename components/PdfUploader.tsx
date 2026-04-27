"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";

interface PdfUploaderProps {
  invoiceId: string;
  invoiceNumber: string;
  currentPdfPath: string | null;
  onUploadComplete: (pdfPath: string) => void;
}

export default function PdfUploader({
  invoiceId,
  invoiceNumber,
  currentPdfPath,
  onUploadComplete,
}: PdfUploaderProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(file: File) {
    if (!user) return;
    if (!file.type.includes("pdf")) {
      setError("Please upload a PDF file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10 MB");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const safeName = invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
      const filePath = `${user.id}/${safeName}_${Date.now()}.pdf`;

      if (currentPdfPath) {
        await supabase.storage.from("bills").remove([currentPdfPath]);
      }

      const { error: uploadErr } = await supabase.storage
        .from("bills")
        .upload(filePath, file, { upsert: true });

      if (uploadErr) throw uploadErr;

      const { error: updateErr } = await supabase
        .from("invoices")
        .update({
          pdf_path: filePath,
          is_matched: true,
          matched_by: user.id,
          matched_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      if (updateErr) throw updateErr;

      onUploadComplete(filePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }

    setUploading(false);
  }

  return (
    <div>
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          uploading
            ? "border-gray-300 bg-gray-50"
            : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <div>
            <div className="animate-spin w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full mx-auto" />
            <p className="mt-2 text-sm text-gray-600">Uploading PDF...</p>
          </div>
        ) : (
          <div>
            <svg className="w-8 h-8 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            <p className="mt-2 text-sm font-medium text-gray-700">
              {currentPdfPath ? "Replace bill PDF" : "Upload bill PDF"}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">PDF, max 10 MB</p>
          </div>
        )}
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
