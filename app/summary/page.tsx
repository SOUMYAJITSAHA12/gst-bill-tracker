"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase, fetchAllRows } from "@/lib/supabase";
import { Invoice } from "@/lib/types";
import { DEMO_INVOICES } from "@/lib/demo-data";
import { formatCurrency, formatDate, generateFinancialYears } from "@/lib/utils";

interface FYSummary {
  fy: string;
  total: number;
  matched: number;
  unmatched: number;
  totalValue: number;
  totalIgst: number;
  totalCgst: number;
  totalSgst: number;
  totalItc: number;
}

export default function SummaryPage() {
  const { user, loading: authLoading, isDemo } = useAuth();
  const router = useRouter();
  const [summaries, setSummaries] = useState<FYSummary[]>([]);
  const [selectedFY, setSelectedFY] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const fetchSummaries = useCallback(async () => {
    if (!user) return;

    let all: Invoice[];
    if (isDemo) {
      all = DEMO_INVOICES;
    } else {
      all = await fetchAllRows<Invoice>(() =>
        supabase.from("invoices").select("*")
      );
      if (all.length === 0) return;
    }
    const byFY: Record<string, Invoice[]> = {};
    for (const inv of all) {
      const fy = inv.financial_year;
      if (!byFY[fy]) byFY[fy] = [];
      byFY[fy].push(inv);
    }

    const results: FYSummary[] = Object.entries(byFY)
      .map(([fy, invs]) => ({
        fy,
        total: invs.length,
        matched: invs.filter((i) => i.is_matched).length,
        unmatched: invs.filter((i) => !i.is_matched).length,
        totalValue: invs.reduce((s, i) => s + i.invoice_value, 0),
        totalIgst: invs.reduce((s, i) => s + i.igst, 0),
        totalCgst: invs.reduce((s, i) => s + i.cgst, 0),
        totalSgst: invs.reduce((s, i) => s + i.sgst, 0),
        totalItc: invs.reduce((s, i) => s + i.igst + i.cgst + i.sgst, 0),
      }))
      .sort((a, b) => b.fy.localeCompare(a.fy));

    setSummaries(results);
    setLoading(false);
  }, [user, isDemo]);

  useEffect(() => {
    fetchSummaries();
  }, [fetchSummaries]);

  async function loadFYInvoices(fy: string) {
    setSelectedFY(fy);
    if (isDemo) {
      setInvoices(DEMO_INVOICES.filter((i) => i.financial_year === fy));
      return;
    }
    const data = await fetchAllRows<Invoice>(() =>
      supabase
        .from("invoices")
        .select("*")
        .eq("financial_year", fy)
        .order("invoice_date", { ascending: false })
    );
    setInvoices(data);
  }

  async function exportToCSV(fy: string) {
    setExporting(true);

    let data: Invoice[];
    if (isDemo) {
      data = DEMO_INVOICES.filter((i) => i.financial_year === fy);
    } else {
      data = await fetchAllRows<Invoice>(() =>
        supabase
          .from("invoices")
          .select("*")
          .eq("financial_year", fy)
          .order("invoice_date", { ascending: true })
      );
    }

    if (data.length === 0) {
      setExporting(false);
      return;
    }

    const headers = [
      "Invoice Number",
      "Invoice Date",
      "Supplier Name",
      "Supplier GSTIN",
      "Invoice Value",
      "Taxable Value",
      "IGST",
      "CGST",
      "SGST/UTGST",
      "Cess",
      "Place of Supply",
      "Reverse Charge",
      "Bill Attached",
      "Notes",
    ];

    const rows = data.map((inv) => [
      inv.invoice_number,
      inv.invoice_date || "",
      inv.supplier_name,
      inv.supplier_gstin,
      inv.invoice_value,
      inv.taxable_value,
      inv.igst,
      inv.cgst,
      inv.sgst,
      inv.cess,
      inv.place_of_supply || "",
      inv.reverse_charge ? "Yes" : "No",
      inv.is_matched ? "Yes" : "No",
      inv.notes || "",
    ]);

    const csvContent =
      [headers, ...rows]
        .map((row) =>
          row
            .map((val) => {
              const str = String(val);
              return str.includes(",") || str.includes('"')
                ? `"${str.replace(/"/g, '""')}"`
                : str;
            })
            .join(",")
        )
        .join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `GST_Bills_FY_${fy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  }

  if (authLoading || !user) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Financial Year Summary
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Overview of invoices and ITC by financial year
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
        </div>
      ) : summaries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">No data yet. Import a GSTR-2B file to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {summaries.map((s) => (
            <div
              key={s.fy}
              className="bg-white rounded-xl border border-gray-200 overflow-hidden"
            >
              <div className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      FY {s.fy}
                    </h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {s.total} invoices | {s.matched} matched | {s.unmatched}{" "}
                      missing
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        selectedFY === s.fy
                          ? setSelectedFY("")
                          : loadFYInvoices(s.fy)
                      }
                      className="px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      {selectedFY === s.fy ? "Hide Details" : "View Details"}
                    </button>
                    <button
                      onClick={() => exportToCSV(s.fy)}
                      disabled={exporting}
                      className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      {exporting ? "Exporting..." : "Export CSV"}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">
                      Total Value
                    </p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {formatCurrency(s.totalValue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">IGST</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {formatCurrency(s.totalIgst)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">CGST</p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {formatCurrency(s.totalCgst)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">
                      SGST/UTGST
                    </p>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5">
                      {formatCurrency(s.totalSgst)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">
                      Total ITC
                    </p>
                    <p className="text-sm font-semibold text-purple-700 mt-0.5">
                      {formatCurrency(s.totalItc)}
                    </p>
                  </div>
                </div>

                {/* Match progress bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Bill matching progress</span>
                    <span>
                      {s.total > 0
                        ? Math.round((s.matched / s.total) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-green-500 rounded-full h-2 transition-all"
                      style={{
                        width: `${
                          s.total > 0
                            ? Math.round((s.matched / s.total) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {selectedFY === s.fy && invoices.length > 0 && (
                <div className="border-t border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="text-left px-4 py-2 font-medium text-gray-600">
                          Invoice No.
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">
                          Date
                        </th>
                        <th className="text-left px-4 py-2 font-medium text-gray-600">
                          Supplier
                        </th>
                        <th className="text-right px-4 py-2 font-medium text-gray-600">
                          Value
                        </th>
                        <th className="text-center px-4 py-2 font-medium text-gray-600">
                          Bill
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono">
                            {inv.invoice_number}
                          </td>
                          <td className="px-4 py-2 text-gray-600">
                            {inv.invoice_date
                              ? formatDate(inv.invoice_date)
                              : "-"}
                          </td>
                          <td className="px-4 py-2">{inv.supplier_name}</td>
                          <td className="px-4 py-2 text-right">
                            {formatCurrency(inv.invoice_value)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            {inv.is_matched ? (
                              <span className="text-green-600 text-xs font-medium">
                                Attached
                              </span>
                            ) : (
                              <span className="text-red-600 text-xs font-medium">
                                Missing
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
