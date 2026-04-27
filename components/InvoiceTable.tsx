"use client";

import { useState, useEffect } from "react";
import { Invoice } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useAuth } from "./AuthProvider";

interface InvoiceTableProps {
  invoices: Invoice[];
  loading: boolean;
  onDeleteComplete?: () => void;
}

const PAGE_SIZE = 50;

export default function InvoiceTable({ invoices, loading, onDeleteComplete }: InvoiceTableProps) {
  const { isDemo } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
    setSelected(new Set());
  }, [invoices]);

  const totalPages = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedInvoices = invoices.slice(
    (safeCurrentPage - 1) * PAGE_SIZE,
    safeCurrentPage * PAGE_SIZE
  );

  const allSelected = invoices.length > 0 && selected.size === invoices.length;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(invoices.map((i) => i.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selected.size === 0 || isDemo) return;
    const confirmed = window.confirm(
      `Delete ${selected.size} selected invoice${selected.size > 1 ? "s" : ""}? This cannot be undone.`
    );
    if (!confirmed) return;

    setDeleting(true);

    const toDelete = invoices.filter((i) => selected.has(i.id));
    const pdfPaths = toDelete
      .filter((i) => i.pdf_path)
      .map((i) => i.pdf_path!);

    const batchSize = 100;

    for (let i = 0; i < pdfPaths.length; i += batchSize) {
      await supabase.storage.from("bills").remove(pdfPaths.slice(i, i + batchSize));
    }

    const ids = toDelete.map((i) => i.id);
    for (let i = 0; i < ids.length; i += batchSize) {
      await supabase.from("invoices").delete().in("id", ids.slice(i, i + batchSize));
    }

    setSelected(new Set());
    setDeleting(false);
    onDeleteComplete?.();
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
        <p className="mt-3 text-sm text-gray-500">Loading invoices...</p>
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <svg className="w-12 h-12 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="mt-3 text-gray-500 font-medium">No invoices found</p>
        <p className="text-sm text-gray-400 mt-1">
          Import a GSTR-2B file to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-sm font-medium text-blue-800">
            {selected.size} invoice{selected.size > 1 ? "s" : ""} selected
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelected(new Set())}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Clear selection
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {deleting ? "Deleting..." : `Delete ${selected.size}`}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Invoice No.</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Supplier</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Value</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">GST</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedInvoices.map((inv) => {
                const gstTotal = inv.igst + inv.cgst + inv.sgst;
                const isSelected = selected.has(inv.id);
                return (
                  <tr
                    key={inv.id}
                    className={`transition-colors ${
                      isSelected ? "bg-blue-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(inv.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {inv.is_matched ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Matched
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                          Missing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">
                      {inv.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {inv.invoice_date ? formatDate(inv.invoice_date) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900">{inv.supplier_name || "-"}</div>
                      <div className="text-xs text-gray-400 font-mono">
                        {inv.supplier_gstin}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">
                      {formatCurrency(inv.invoice_value)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {formatCurrency(gstTotal)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y divide-gray-100">
          {paginatedInvoices.map((inv) => {
            const gstTotal = inv.igst + inv.cgst + inv.sgst;
            const isSelected = selected.has(inv.id);
            return (
              <div
                key={inv.id}
                className={`p-4 transition-colors ${isSelected ? "bg-blue-50" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(inv.id)}
                    className="mt-1 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <Link
                    href={`/invoices/${inv.id}`}
                    className="flex-1 min-w-0"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-mono font-medium text-gray-900">
                          {inv.invoice_number}
                        </p>
                        <p className="text-sm text-gray-600 mt-0.5">
                          {inv.supplier_name || inv.supplier_gstin}
                        </p>
                      </div>
                      {inv.is_matched ? (
                        <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                          Matched
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-full">
                          Missing
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>{inv.invoice_date ? formatDate(inv.invoice_date) : "-"}</span>
                      <span>{formatCurrency(inv.invoice_value)}</span>
                      <span className="text-xs">GST: {formatCurrency(gstTotal)}</span>
                    </div>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          <p className="text-sm text-gray-500">
            Showing {(safeCurrentPage - 1) * PAGE_SIZE + 1}–
            {Math.min(safeCurrentPage * PAGE_SIZE, invoices.length)} of{" "}
            {invoices.length} invoices
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage === 1}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage === 1}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => {
                if (totalPages <= 7) return true;
                if (p === 1 || p === totalPages) return true;
                return Math.abs(p - safeCurrentPage) <= 2;
              })
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "..." ? (
                  <span key={`ellipsis-${idx}`} className="px-1.5 text-xs text-gray-400">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item as number)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      item === safeCurrentPage
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage === totalPages}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage === totalPages}
              className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
