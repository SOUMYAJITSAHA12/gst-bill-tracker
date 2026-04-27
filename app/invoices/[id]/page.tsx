"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Invoice } from "@/lib/types";
import { DEMO_INVOICES } from "@/lib/demo-data";
import { formatCurrency, formatDate } from "@/lib/utils";
import { isGoogleDriveConfigured } from "@/lib/google-drive";
import PdfUploader from "@/components/PdfUploader";
import GoogleDriveUploader from "@/components/GoogleDriveUploader";

export default function InvoiceDetailPage() {
  const { user, loading: authLoading, isDemo } = useAuth();
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [driveLink, setDriveLink] = useState("");
  const [savingLink, setSavingLink] = useState(false);
  const [linkSaved, setLinkSaved] = useState(false);
  const [attachMode, setAttachMode] = useState<"upload" | "gdrive" | "link">(
    isGoogleDriveConfigured() ? "gdrive" : "upload"
  );
  const gdriveConfigured = isGoogleDriveConfigured();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const fetchInvoice = useCallback(async () => {
    if (!invoiceId) return;

    if (isDemo) {
      const demoInv = DEMO_INVOICES.find((i) => i.id === invoiceId);
      if (!demoInv) {
        router.replace("/dashboard");
        return;
      }
      setInvoice(demoInv);
      setNotes(demoInv.notes || "");
      setDriveLink(demoInv.external_link || "");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (error || !data) {
      router.replace("/dashboard");
      return;
    }

    const inv = data as Invoice;
    setInvoice(inv);
    setNotes(inv.notes || "");
    setDriveLink(inv.external_link || "");

    if (inv.pdf_path) {
      const { data: urlData } = await supabase.storage
        .from("bills")
        .createSignedUrl(inv.pdf_path, 3600);
      if (urlData) setPdfUrl(urlData.signedUrl);
    }

    setLoading(false);
  }, [invoiceId, isDemo, router]);

  useEffect(() => {
    if (user) fetchInvoice();
  }, [user, fetchInvoice]);

  async function saveNotes() {
    if (!invoice || isDemo) return;
    setSavingNotes(true);
    await supabase
      .from("invoices")
      .update({ notes: notes.trim() || null })
      .eq("id", invoice.id);
    setSavingNotes(false);
  }

  async function handlePdfUpload(pdfPath: string) {
    setInvoice((prev) => (prev ? { ...prev, pdf_path: pdfPath, is_matched: true } : prev));
    const { data: urlData } = await supabase.storage
      .from("bills")
      .createSignedUrl(pdfPath, 3600);
    if (urlData) setPdfUrl(urlData.signedUrl);
  }

  async function saveDriveLink() {
    if (!invoice || isDemo) return;
    setSavingLink(true);
    setLinkSaved(false);

    const link = driveLink.trim() || null;
    const matched = !!(link || invoice.pdf_path);

    await supabase
      .from("invoices")
      .update({
        external_link: link,
        is_matched: matched,
        matched_by: matched ? user?.id : null,
        matched_at: matched ? new Date().toISOString() : null,
      })
      .eq("id", invoice.id);

    setInvoice((prev) =>
      prev ? { ...prev, external_link: link, is_matched: matched } : prev
    );
    setSavingLink(false);
    setLinkSaved(true);
    setTimeout(() => setLinkSaved(false), 2000);
  }

  async function removePdf() {
    if (!invoice?.pdf_path) return;
    const confirmDelete = window.confirm("Remove the attached bill PDF?");
    if (!confirmDelete) return;

    await supabase.storage.from("bills").remove([invoice.pdf_path]);

    const stillMatched = !!invoice.external_link;
    await supabase
      .from("invoices")
      .update({
        pdf_path: null,
        is_matched: stillMatched,
        matched_by: stillMatched ? invoice.matched_by : null,
        matched_at: stillMatched ? invoice.matched_at : null,
      })
      .eq("id", invoice.id);

    setInvoice((prev) =>
      prev ? { ...prev, pdf_path: null, is_matched: stillMatched } : prev
    );
    setPdfUrl(null);
  }

  async function removeDriveLink() {
    if (!invoice || isDemo) return;
    const confirmDelete = window.confirm("Remove the Google Drive link?");
    if (!confirmDelete) return;

    const stillMatched = !!invoice.pdf_path;
    await supabase
      .from("invoices")
      .update({
        external_link: null,
        is_matched: stillMatched,
        matched_by: stillMatched ? invoice.matched_by : null,
        matched_at: stillMatched ? invoice.matched_at : null,
      })
      .eq("id", invoice.id);

    setInvoice((prev) =>
      prev ? { ...prev, external_link: null, is_matched: stillMatched } : prev
    );
    setDriveLink("");
  }

  async function deleteInvoice() {
    if (!invoice || isDemo) return;
    const confirmed = window.confirm(
      `Delete invoice ${invoice.invoice_number}? This will remove the invoice and any attached bill.`
    );
    if (!confirmed) return;

    if (invoice.pdf_path) {
      await supabase.storage.from("bills").remove([invoice.pdf_path]);
    }
    await supabase.from("invoices").delete().eq("id", invoice.id);
    router.replace("/dashboard");
  }

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!invoice) return null;

  const gstTotal = invoice.igst + invoice.cgst + invoice.sgst;
  const hasPdf = invoice.pdf_path && pdfUrl;
  const hasLink = !!invoice.external_link;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">
            Invoice {invoice.invoice_number}
          </h1>
          <p className="text-sm text-gray-500">
            {invoice.supplier_name || invoice.supplier_gstin}
          </p>
        </div>
        {invoice.is_matched ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Bill Attached
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 px-3 py-1.5 rounded-full border border-red-200">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            Bill Missing
          </span>
        )}
        <button
          onClick={deleteInvoice}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete invoice"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Invoice details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-medium text-gray-900 mb-4">Invoice Details</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Invoice Number</dt>
              <dd className="font-mono font-medium text-gray-900">
                {invoice.invoice_number}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Invoice Date</dt>
              <dd className="text-gray-900">
                {invoice.invoice_date ? formatDate(invoice.invoice_date) : "-"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Supplier</dt>
              <dd className="text-gray-900 text-right">
                {invoice.supplier_name || "-"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Supplier GSTIN</dt>
              <dd className="font-mono text-gray-900">{invoice.supplier_gstin}</dd>
            </div>
            {invoice.place_of_supply && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Place of Supply</dt>
                <dd className="text-gray-900">{invoice.place_of_supply}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Reverse Charge</dt>
              <dd className="text-gray-900">
                {invoice.reverse_charge ? "Yes" : "No"}
              </dd>
            </div>
            <hr className="border-gray-100" />
            <div className="flex justify-between">
              <dt className="text-gray-500">Taxable Value</dt>
              <dd className="text-gray-900">
                {formatCurrency(invoice.taxable_value)}
              </dd>
            </div>
            {invoice.igst > 0 && (
              <div className="flex justify-between">
                <dt className="text-gray-500">IGST</dt>
                <dd className="text-gray-900">{formatCurrency(invoice.igst)}</dd>
              </div>
            )}
            {invoice.cgst > 0 && (
              <div className="flex justify-between">
                <dt className="text-gray-500">CGST</dt>
                <dd className="text-gray-900">{formatCurrency(invoice.cgst)}</dd>
              </div>
            )}
            {invoice.sgst > 0 && (
              <div className="flex justify-between">
                <dt className="text-gray-500">SGST/UTGST</dt>
                <dd className="text-gray-900">{formatCurrency(invoice.sgst)}</dd>
              </div>
            )}
            {invoice.cess > 0 && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Cess</dt>
                <dd className="text-gray-900">{formatCurrency(invoice.cess)}</dd>
              </div>
            )}
            <hr className="border-gray-100" />
            <div className="flex justify-between font-medium">
              <dt className="text-gray-700">Total GST</dt>
              <dd className="text-gray-900">{formatCurrency(gstTotal)}</dd>
            </div>
            <div className="flex justify-between font-medium">
              <dt className="text-gray-700">Invoice Value</dt>
              <dd className="text-gray-900 text-lg">
                {formatCurrency(invoice.invoice_value)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Bill attachment section */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-medium text-gray-900 mb-4">Attach Bill</h2>

            {/* Show existing attachments */}
            {(hasPdf || hasLink) && (
              <div className="space-y-3 mb-4">
                {hasPdf && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <svg className="w-7 h-7 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-green-800">PDF uploaded</p>
                        {invoice.matched_at && (
                          <p className="text-xs text-green-600">{formatDate(invoice.matched_at)}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <a
                        href={pdfUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        View / Download
                      </a>
                      <button
                        onClick={removePdf}
                        className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}

                {hasLink && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <svg className="w-7 h-7 text-green-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.35 10.04A7.49 7.49 0 0012 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 000 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-green-800">Google Drive link</p>
                        <p className="text-xs text-green-600 truncate">{invoice.external_link}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <a
                        href={invoice.external_link!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Open in Drive
                      </a>
                      <button
                        onClick={removeDriveLink}
                        className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Attach mode toggle */}
            <div className="flex rounded-lg border border-gray-200 p-0.5 mb-4">
              {gdriveConfigured && (
                <button
                  onClick={() => setAttachMode("gdrive")}
                  className={`flex-1 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                    attachMode === "gdrive"
                      ? "bg-green-600 text-white"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  Google Drive
                </button>
              )}
              <button
                onClick={() => setAttachMode("upload")}
                className={`flex-1 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  attachMode === "upload"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Direct Upload
              </button>
              <button
                onClick={() => setAttachMode("link")}
                className={`flex-1 py-2 text-xs sm:text-sm font-medium rounded-md transition-colors ${
                  attachMode === "link"
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Paste Link
              </button>
            </div>

            {attachMode === "gdrive" && gdriveConfigured ? (
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  Upload PDF — auto-saved to your Google Drive (15GB free)
                </p>
                <GoogleDriveUploader
                  invoiceId={invoice.id}
                  invoiceNumber={invoice.invoice_number}
                  financialYear={invoice.financial_year}
                  invoiceDate={invoice.invoice_date || undefined}
                  onUploadComplete={(link) => {
                    setInvoice((prev) =>
                      prev ? { ...prev, external_link: link, is_matched: true } : prev
                    );
                    setDriveLink(link);
                  }}
                />
              </div>
            ) : attachMode === "upload" ? (
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  Upload bill PDF directly (stored in Supabase, 1GB free)
                </p>
                <PdfUploader
                  invoiceId={invoice.id}
                  invoiceNumber={invoice.invoice_number}
                  currentPdfPath={invoice.pdf_path}
                  onUploadComplete={handlePdfUpload}
                />
              </div>
            ) : (
              <div>
                <p className="text-xs text-gray-500 mb-2">
                  Paste a Google Drive or any external link to the bill
                </p>
                <div className="space-y-3">
                  <input
                    type="url"
                    value={driveLink}
                    onChange={(e) => {
                      setDriveLink(e.target.value);
                      setLinkSaved(false);
                    }}
                    placeholder="https://drive.google.com/file/d/..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={saveDriveLink}
                    disabled={savingLink || !driveLink.trim()}
                    className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {savingLink ? "Saving..." : linkSaved ? "Saved!" : "Save Link"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-medium text-gray-900 mb-3">Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add notes about this invoice (e.g., ordered by, return status, etc.)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="mt-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              {savingNotes ? "Saving..." : "Save Notes"}
            </button>
          </div>

          <div className="text-xs text-gray-400 px-1">
            <p>FY: {invoice.financial_year}</p>
            {invoice.return_period && <p>Return Period: {invoice.return_period}</p>}
            <p>Added: {formatDate(invoice.created_at)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
