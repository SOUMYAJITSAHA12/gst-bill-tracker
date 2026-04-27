"use client";

import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import {
  ExtractedBill,
  extractBillsFromZip,
  extractBillFromPdf,
} from "@/lib/pdf-invoice-extractor";
import {
  isGoogleDriveConfigured,
  requestGoogleAccessToken,
  uploadToDrive,
} from "@/lib/google-drive";

type StorageOption = "supabase" | "gdrive";

interface MatchedBill extends ExtractedBill {
  matchedInvoiceId?: string;
  supplierName?: string;
  financialYear?: string;
  invoiceDate?: string;
}

export default function BulkBillUploader() {
  const { user, isDemo } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);
  const [bills, setBills] = useState<MatchedBill[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    attached: number;
    failed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [storageOption, setStorageOption] = useState<StorageOption>("supabase");
  const [gdriveConnected, setGdriveConnected] = useState(false);

  async function handleFiles(files: FileList) {
    setProcessing(true);
    setError(null);
    setBills([]);
    setUploadResult(null);

    try {
      const allBills: ExtractedBill[] = [];
      const fileArray = Array.from(files);
      const totalFiles = fileArray.length;
      let processedFiles = 0;
      let failedFiles = 0;

      for (const file of fileArray) {
        try {
          if (
            file.type === "application/zip" ||
            file.type === "application/x-zip-compressed" ||
            file.name.toLowerCase().endsWith(".zip")
          ) {
            setProgress(
              `Processing ZIP ${processedFiles + 1}/${totalFiles}: ${file.name}...`
            );
            const zipBills = await extractBillsFromZip(file);
            allBills.push(...zipBills);
          } else if (
            file.type === "application/pdf" ||
            file.name.toLowerCase().endsWith(".pdf")
          ) {
            setProgress(
              `Reading PDF ${processedFiles + 1}/${totalFiles}: ${file.name}...`
            );
            const bill = await extractBillFromPdf(file);
            allBills.push(bill);
          }
        } catch {
          failedFiles++;
        }
        processedFiles++;
      }

      if (allBills.length === 0) {
        setError(
          failedFiles > 0
            ? `${failedFiles} file(s) failed to process and no valid PDFs were found.`
            : "No PDF files found. Please upload PDF files or a ZIP containing PDFs."
        );
        setProcessing(false);
        return;
      }

      setProgress(
        `Matching ${allBills.length} bills with database invoices...`
      );
      const matched = await matchWithDatabase(allBills);
      setBills(matched);

      if (failedFiles > 0) {
        setError(
          `${failedFiles} file(s) could not be processed. ${allBills.length} bills extracted successfully.`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to process files"
      );
    }

    setProgress("");
    setProcessing(false);
  }

  async function matchWithDatabase(
    extractedBills: ExtractedBill[]
  ): Promise<MatchedBill[]> {
    const invoiceNumbers = extractedBills
      .map((b) => b.invoiceNumber)
      .filter(Boolean) as string[];

    if (invoiceNumbers.length === 0) {
      return extractedBills.map((b) => ({
        ...b,
        matchStatus: "unmatched" as const,
      }));
    }

    if (isDemo) {
      return extractedBills.map((b) => ({
        ...b,
        matchStatus: b.invoiceNumber ? "matched" as const : "unmatched" as const,
        matchedInvoiceId: b.invoiceNumber ? "demo-id" : undefined,
        supplierName: b.invoiceNumber ? "Demo Supplier" : undefined,
      }));
    }

    const allDbInvoices: any[] = [];
    const batchSize = 50;
    for (let i = 0; i < invoiceNumbers.length; i += batchSize) {
      const batch = invoiceNumbers.slice(i, i + batchSize);
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, supplier_name, financial_year, invoice_date, pdf_path, external_link")
        .in("invoice_number", batch);
      if (data) allDbInvoices.push(...data);
    }

    const invoiceMap = new Map(
      allDbInvoices.map((inv) => [inv.invoice_number, inv])
    );

    return extractedBills.map((bill) => {
      const dbMatch = bill.invoiceNumber
        ? invoiceMap.get(bill.invoiceNumber)
        : null;

      let matchStatus: "matched" | "unmatched" | "already_attached";
      if (!dbMatch) {
        matchStatus = "unmatched";
      } else if (dbMatch.pdf_path || dbMatch.external_link) {
        matchStatus = "already_attached";
      } else {
        matchStatus = "matched";
      }

      return {
        ...bill,
        matchStatus,
        matchedInvoiceId: dbMatch?.id,
        supplierName: dbMatch?.supplier_name,
        financialYear: dbMatch?.financial_year,
        invoiceDate: dbMatch?.invoice_date,
      };
    });
  }

  async function handleConnectGDrive() {
    try {
      setError(null);
      await requestGoogleAccessToken();
      setGdriveConnected(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect Google Drive"
      );
    }
  }

  async function handleAttachAll() {
    if (!user) return;

    const matchedBills = bills.filter(
      (b) => b.matchStatus === "matched" && b.matchedInvoiceId
    );

    if (matchedBills.length === 0) return;

    if (isDemo) {
      setError("Cannot upload in demo mode. Connect Supabase to attach bills.");
      return;
    }

    setUploading(true);
    setUploadResult(null);
    let attached = 0;
    let failed = 0;

    const totalToAttach = matchedBills.length;
    for (let idx = 0; idx < matchedBills.length; idx++) {
      const bill = matchedBills[idx];
      try {
        setProgress(
          `Uploading ${idx + 1}/${totalToAttach}: ${bill.fileName}...`
        );

        if (storageOption === "gdrive") {
          const file = new File([bill.pdfBlob], bill.fileName, {
            type: "application/pdf",
          });
          const { webViewLink } = await uploadToDrive(
            file,
            bill.invoiceNumber || bill.fileName,
            bill.financialYear || "Unknown",
            bill.invoiceDate || undefined
          );

          const { error: updateErr } = await supabase
            .from("invoices")
            .update({
              external_link: webViewLink,
              is_matched: true,
              matched_by: user.id,
              matched_at: new Date().toISOString(),
            })
            .eq("id", bill.matchedInvoiceId!);

          if (updateErr) throw updateErr;
        } else {
          const safeName = (bill.invoiceNumber || bill.fileName).replace(
            /[^a-zA-Z0-9-_]/g,
            "_"
          );
          const filePath = `${user.id}/${safeName}_${Date.now()}.pdf`;

          const { error: uploadErr } = await supabase.storage
            .from("bills")
            .upload(filePath, bill.pdfBlob, {
              upsert: true,
              contentType: "application/pdf",
            });

          if (uploadErr) throw uploadErr;

          const { error: updateErr } = await supabase
            .from("invoices")
            .update({
              pdf_path: filePath,
              is_matched: true,
              matched_by: user.id,
              matched_at: new Date().toISOString(),
            })
            .eq("id", bill.matchedInvoiceId!);

          if (updateErr) throw updateErr;
        }
        attached++;
      } catch {
        failed++;
      }
    }

    setProgress("");
    setUploading(false);
    setUploadResult({ attached, failed });
  }

  const matchedCount = bills.filter((b) => b.matchStatus === "matched").length;
  const alreadyAttachedCount = bills.filter((b) => b.matchStatus === "already_attached").length;
  const unmatchedCount = bills.filter(
    (b) => b.matchStatus === "unmatched"
  ).length;
  const noInvoiceCount = bills.filter((b) => !b.invoiceNumber).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">
          Bulk Attach Bills
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload ZIP or PDF files. Invoice numbers are auto-detected and matched
          with imported GSTR-2B invoices.
        </p>
      </div>

      <div
        onClick={() => !processing && !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          processing || uploading
            ? "border-gray-200 bg-gray-50 cursor-wait"
            : "border-gray-300 hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {processing ? (
          <div>
            <div className="animate-spin w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full mx-auto" />
            <p className="mt-3 text-sm text-gray-600">{progress}</p>
          </div>
        ) : (
          <div>
            <svg
              className="w-10 h-10 text-gray-400 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="mt-3 text-sm font-medium text-gray-700">
              Drop ZIP or PDF files here, or click to browse
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Supports Flipkart ZIP bundles, Amazon PDFs, Samsung PDFs, and more
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg p-3 bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {bills.length > 0 && !uploadResult && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-medium">
              {bills.length} bill{bills.length > 1 ? "s" : ""} found
            </span>
            {matchedCount > 0 && (
              <span className="px-3 py-1 rounded-full bg-green-100 text-green-800 font-medium">
                {matchedCount} matched
              </span>
            )}
            {alreadyAttachedCount > 0 && (
              <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-800 font-medium">
                {alreadyAttachedCount} already attached
              </span>
            )}
            {unmatchedCount > 0 && (
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-medium">
                {unmatchedCount - noInvoiceCount} not in database
              </span>
            )}
            {noInvoiceCount > 0 && (
              <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                {noInvoiceCount} no invoice # detected
              </span>
            )}
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="px-4 py-2">File</th>
                    <th className="px-4 py-2">Detected Invoice #</th>
                    <th className="px-4 py-2">Supplier</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bills.map((bill, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-700">
                        {bill.fileName}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {bill.invoiceNumber || (
                          <span className="text-gray-400 italic">
                            Not detected
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600">
                        {bill.supplierName || "—"}
                      </td>
                      <td className="px-4 py-2">
                        {bill.matchStatus === "matched" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                            <svg
                              className="w-3 h-3"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Ready to attach
                          </span>
                        ) : bill.matchStatus === "already_attached" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                            Already attached
                          </span>
                        ) : bill.invoiceNumber ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                            Not in DB
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            No Invoice #
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {matchedCount > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">
                  Upload to:
                </span>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setStorageOption("supabase")}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      storageOption === "supabase"
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    Supabase Storage
                  </button>
                  {isGoogleDriveConfigured() && (
                    <button
                      onClick={() => setStorageOption("gdrive")}
                      className={`px-3 py-1.5 text-xs font-medium border-l border-gray-200 transition-colors ${
                        storageOption === "gdrive"
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Google Drive
                    </button>
                  )}
                </div>
              </div>

              {storageOption === "gdrive" && !gdriveConnected && (
                <button
                  onClick={handleConnectGDrive}
                  className="w-full px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors inline-flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Connect Google Drive
                </button>
              )}

              {(storageOption === "supabase" ||
                (storageOption === "gdrive" && gdriveConnected)) && (
                <button
                  onClick={handleAttachAll}
                  disabled={uploading}
                  className="w-full px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {uploading
                    ? progress || "Uploading..."
                    : `Attach ${matchedCount} Matched Bill${matchedCount > 1 ? "s" : ""} to ${storageOption === "gdrive" ? "Google Drive" : "Supabase"}`}
                </button>
              )}
            </div>
          )}

          {matchedCount === 0 && (
            <div className="rounded-lg p-3 bg-amber-50 border border-amber-200 text-sm text-amber-700">
              No bills matched with existing invoices. Make sure you have
              imported the GSTR-2B Excel first, then upload the bills.
            </div>
          )}

          <button
            onClick={() => {
              setBills([]);
              setUploadResult(null);
              setError(null);
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear results
          </button>
        </div>
      )}

      {uploadResult && (
        <div
          className={`rounded-lg p-4 border ${
            uploadResult.failed === 0
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          <p className="font-medium">
            {uploadResult.attached} bill{uploadResult.attached > 1 ? "s" : ""}{" "}
            attached successfully!
          </p>
          {uploadResult.failed > 0 && (
            <p className="text-sm mt-1">
              {uploadResult.failed} bill{uploadResult.failed > 1 ? "s" : ""}{" "}
              failed to upload.
            </p>
          )}
          <button
            onClick={() => {
              setBills([]);
              setUploadResult(null);
            }}
            className="mt-2 text-sm underline"
          >
            Upload more bills
          </button>
        </div>
      )}
    </div>
  );
}
