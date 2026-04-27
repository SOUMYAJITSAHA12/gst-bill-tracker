"use client";

import { useState, useRef } from "react";
import { parseGstr2bExcel, GstrInvoice } from "@/lib/gstr-parser";
import { getFinancialYear } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthProvider";
import { formatCurrency } from "@/lib/utils";

export default function GstrUploader({ onImportComplete }: { onImportComplete: () => void }) {
  const { user, isDemo } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<{
    invoices: GstrInvoice[];
    returnPeriod: string;
    errors: string[];
    fileName: string;
  } | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    imported: number;
    skipped: number;
  } | null>(null);

  async function handleFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setResult({
        success: false,
        message: "Please upload an Excel file (.xlsx or .xls)",
        imported: 0,
        skipped: 0,
      });
      return;
    }

    setParsing(true);
    setResult(null);
    setParsed(null);

    try {
      const buffer = await file.arrayBuffer();
      const { invoices, returnPeriod, errors } = parseGstr2bExcel(buffer);

      if (errors.length > 0 && invoices.length === 0) {
        setResult({
          success: false,
          message: errors.join(". "),
          imported: 0,
          skipped: 0,
        });
        setParsing(false);
        return;
      }

      setParsed({
        invoices,
        returnPeriod,
        errors,
        fileName: file.name,
      });
    } catch (err) {
      setResult({
        success: false,
        message: `Failed to parse file: ${err instanceof Error ? err.message : "Unknown error"}`,
        imported: 0,
        skipped: 0,
      });
    }

    setParsing(false);
  }

  async function checkDuplicates() {
    if (!parsed) return;

    const invoiceKeys = parsed.invoices.map(
      (inv) => `${inv.supplier_gstin}||${inv.invoice_number}`
    );

    const { data: existing } = await supabase
      .from("invoices")
      .select("supplier_gstin, invoice_number")
      .in("invoice_number", parsed.invoices.map((i) => i.invoice_number));

    if (!existing) return { newInvoices: parsed.invoices, duplicateCount: 0 };

    const existingKeys = new Set(
      existing.map((e) => `${e.supplier_gstin}||${e.invoice_number}`)
    );

    const newInvoices = parsed.invoices.filter(
      (inv) => !existingKeys.has(`${inv.supplier_gstin}||${inv.invoice_number}`)
    );
    const duplicateCount = parsed.invoices.length - newInvoices.length;

    return { newInvoices, duplicateCount };
  }

  async function handleSave() {
    if (!parsed || !user) return;

    if (isDemo) {
      setResult({
        success: false,
        message: "Cannot save in demo mode. Connect Supabase to import invoices to the database.",
        imported: 0,
        skipped: 0,
      });
      return;
    }

    setSaving(true);
    setResult(null);

    try {
      const { newInvoices, duplicateCount } = (await checkDuplicates()) ?? {
        newInvoices: parsed.invoices,
        duplicateCount: 0,
      };

      if (newInvoices.length === 0) {
        setResult({
          success: true,
          message: "All invoices already exist in the database.",
          imported: 0,
          skipped: duplicateCount,
        });
        setSaving(false);
        return;
      }

      const now = new Date();
      const financialYear =
        parsed.returnPeriod
          ? getFinancialYear(
              new Date(
                parseInt(parsed.returnPeriod.slice(2)),
                parseInt(parsed.returnPeriod.slice(0, 2)) - 1
              )
            )
          : getFinancialYear(now);

      const { data: importRow, error: importErr } = await supabase
        .from("gstr_imports")
        .insert({
          file_name: parsed.fileName,
          return_period: parsed.returnPeriod || null,
          financial_year: financialYear,
          invoice_count: newInvoices.length,
          uploaded_by: user.id,
        })
        .select("id")
        .single();

      if (importErr) throw importErr;

      let imported = 0;

      const batchSize = 50;
      for (let i = 0; i < newInvoices.length; i += batchSize) {
        const batch = newInvoices.slice(i, i + batchSize).map((inv) => ({
          import_id: importRow.id,
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date || null,
          supplier_gstin: inv.supplier_gstin,
          supplier_name: inv.supplier_name,
          invoice_value: inv.invoice_value,
          taxable_value: inv.taxable_value,
          igst: inv.igst,
          cgst: inv.cgst,
          sgst: inv.sgst,
          cess: inv.cess,
          place_of_supply: inv.place_of_supply || null,
          reverse_charge: inv.reverse_charge,
          rate: inv.rate,
          financial_year: financialYear,
          return_period: parsed.returnPeriod || null,
        }));

        const { data, error } = await supabase
          .from("invoices")
          .upsert(batch, {
            onConflict: "supplier_gstin,invoice_number",
            ignoreDuplicates: true,
          })
          .select("id");

        if (error) throw error;
        imported += data?.length ?? 0;
      }

      setResult({
        success: true,
        message: duplicateCount > 0
          ? `Import complete! ${duplicateCount} duplicate invoice${duplicateCount > 1 ? "s" : ""} skipped.`
          : "Import complete!",
        imported,
        skipped: duplicateCount,
      });
      setParsed(null);
      onImportComplete();
    } catch (err) {
      setResult({
        success: false,
        message: `Failed to save: ${err instanceof Error ? err.message : "Unknown error"}`,
        imported: 0,
        skipped: 0,
      });
    }

    setSaving(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        {parsing ? (
          <div>
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
            <p className="mt-3 text-sm text-gray-600">Parsing GSTR-2B file...</p>
          </div>
        ) : (
          <div>
            <svg className="w-10 h-10 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="mt-3 text-sm font-medium text-gray-700">
              Drop your GSTR-2B Excel file here, or click to browse
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Supports .xlsx and .xls files downloaded from the GST portal
            </p>
          </div>
        )}
      </div>

      {parsed && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="font-medium text-blue-900">
              File parsed: {parsed.fileName}
            </h3>
            <p className="text-sm text-blue-700 mt-1">
              Found <strong>{parsed.invoices.length}</strong> invoices
              {parsed.returnPeriod && (
                <> for return period <strong>{parsed.returnPeriod}</strong></>
              )}
              {" "}| Total value:{" "}
              <strong>
                {formatCurrency(
                  parsed.invoices.reduce((s, i) => s + i.invoice_value, 0)
                )}
              </strong>
            </p>
            {parsed.errors.length > 0 && (
              <div className="mt-2 text-sm text-amber-700">
                {parsed.errors.map((err, i) => (
                  <p key={i}>Warning: {err}</p>
                ))}
              </div>
            )}
            {isDemo && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                Demo mode: Parsing works, but saving to database requires Supabase. Preview your invoices below.
              </p>
            )}
            <div className="mt-3 flex gap-3">
              {!isDemo && (
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? "Saving..." : `Import ${parsed.invoices.length} Invoices`}
                </button>
              )}
              <button
                onClick={() => setParsed(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>

          {/* Preview table of parsed invoices */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-700">
                Preview: {parsed.invoices.length} invoices parsed
              </h3>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-200">
                    <th className="text-left px-3 py-2 font-medium text-gray-600">#</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Invoice No.</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Supplier</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Value</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">GST</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {parsed.invoices.map((inv, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-gray-900">{inv.invoice_number}</td>
                      <td className="px-3 py-2 text-gray-600">{inv.invoice_date || "-"}</td>
                      <td className="px-3 py-2">
                        <div className="text-gray-900 max-w-[200px] truncate">{inv.supplier_name}</div>
                        <div className="text-xs text-gray-400 font-mono">{inv.supplier_gstin}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-900">{formatCurrency(inv.invoice_value)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {formatCurrency(inv.igst + inv.cgst + inv.sgst)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div
          className={`rounded-xl p-4 border ${
            result.success
              ? result.imported === 0 && result.skipped > 0
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <p className="font-medium">{result.message}</p>
          {result.success && result.imported > 0 && (
            <p className="text-sm mt-1">
              {result.imported} new invoice{result.imported > 1 ? "s" : ""} imported
              {result.skipped > 0 && ` | ${result.skipped} duplicate${result.skipped > 1 ? "s" : ""} already existed`}
            </p>
          )}
          {result.success && result.imported === 0 && result.skipped > 0 && (
            <p className="text-sm mt-1">
              All {result.skipped} invoice{result.skipped > 1 ? "s" : ""} from this file are already in the database. No duplicates were added.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
