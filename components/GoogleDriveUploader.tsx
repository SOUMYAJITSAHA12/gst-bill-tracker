"use client";

import { useState, useRef } from "react";
import { uploadToDrive, requestGoogleAccessToken } from "@/lib/google-drive";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";

interface GoogleDriveUploaderProps {
  invoiceId: string;
  invoiceNumber: string;
  financialYear: string;
  invoiceDate?: string;
  onUploadComplete: (driveLink: string) => void;
}

export default function GoogleDriveUploader({
  invoiceId,
  invoiceNumber,
  financialYear,
  invoiceDate,
  onUploadComplete,
}: GoogleDriveUploaderProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      await requestGoogleAccessToken();
      setConnected(true);
      if (pendingFile) {
        await doUpload(pendingFile);
        setPendingFile(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
    setConnecting(false);
  }

  async function doUpload(file: File) {
    if (!user) return;

    setUploading(true);
    setError(null);
    setStatus("Uploading to Google Drive...");

    try {
      const { webViewLink } = await uploadToDrive(
        file,
        invoiceNumber,
        financialYear,
        invoiceDate
      );

      setStatus("Saving link...");
      const { error: updateErr } = await supabase
        .from("invoices")
        .update({
          external_link: webViewLink,
          is_matched: true,
          matched_by: user.id,
          matched_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

      if (updateErr) throw updateErr;

      setStatus("");
      onUploadComplete(webViewLink);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      if (msg.includes("expired") || msg.includes("401")) {
        setConnected(false);
        setPendingFile(file);
        setError("Google session expired. Click 'Connect' again.");
      } else {
        setError(msg);
      }
      setStatus("");
    }

    setUploading(false);
  }

  function handleFileSelect(file: File) {
    if (!file.type.includes("pdf")) {
      setError("Please upload a PDF file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10 MB");
      return;
    }

    if (!connected) {
      setPendingFile(file);
      setError("Please connect to Google Drive first (click the button above)");
      return;
    }

    doUpload(file);
  }

  return (
    <div className="space-y-3">
      {/* Step 1: Connect to Google */}
      {!connected ? (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 border-2 border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
        >
          {connecting ? (
            <>
              <div className="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full" />
              <span className="text-sm font-medium text-gray-700">Connecting...</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">
                Connect Google Drive
              </span>
            </>
          )}
        </button>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-green-700 font-medium">Google Drive connected</span>
        </div>
      )}

      {/* Step 2: Select file */}
      <div
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors ${
          uploading
            ? "border-gray-300 bg-gray-50 cursor-wait"
            : connected
            ? "border-green-300 hover:border-green-400 hover:bg-green-50 cursor-pointer"
            : "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
            e.target.value = "";
          }}
        />
        {uploading ? (
          <div>
            <div className="animate-spin w-6 h-6 border-3 border-green-600 border-t-transparent rounded-full mx-auto" />
            <p className="mt-2 text-sm text-gray-600">{status}</p>
          </div>
        ) : (
          <div>
            <svg className="w-8 h-8 text-green-500 mx-auto" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
            </svg>
            <p className="mt-2 text-sm font-medium text-gray-700">
              {connected ? "Select PDF to upload" : "Connect Google Drive first"}
            </p>
            <p className="mt-0.5 text-xs text-gray-400">
              Auto-saved to GST Bills / FY {financialYear} folder
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
