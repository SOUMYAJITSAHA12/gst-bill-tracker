"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Invoice, DashboardStats } from "@/lib/types";
import { DEMO_INVOICES, getDemoStats } from "@/lib/demo-data";
import StatsCards from "@/components/StatsCards";
import SearchBar from "@/components/SearchBar";
import InvoiceTable from "@/components/InvoiceTable";

function invoiceMatchesMonth(inv: Invoice, month: string): boolean {
  if (!month || !inv.invoice_date) return true;
  const d = new Date(inv.invoice_date);
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  return m === month;
}

export default function DashboardPage() {
  const { user, loading: authLoading, isDemo } = useAuth();
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [financialYear, setFinancialYear] = useState("");
  const [month, setMonth] = useState("");
  const [matchFilter, setMatchFilter] = useState<"all" | "matched" | "unmatched">("all");
  const [stats, setStats] = useState<DashboardStats>({
    totalInvoices: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    totalItc: 0,
    totalTaxableValue: 0,
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const filteredDemoInvoices = useMemo(() => {
    let result = DEMO_INVOICES;
    if (financialYear) result = result.filter((i) => i.financial_year === financialYear);
    if (month) result = result.filter((i) => invoiceMatchesMonth(i, month));
    if (matchFilter === "matched") result = result.filter((i) => i.is_matched);
    else if (matchFilter === "unmatched") result = result.filter((i) => !i.is_matched);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      result = result.filter(
        (i) =>
          i.invoice_number.toLowerCase().includes(s) ||
          i.supplier_name.toLowerCase().includes(s) ||
          i.supplier_gstin.toLowerCase().includes(s)
      );
    }
    return result;
  }, [financialYear, month, matchFilter, search]);

  const fetchInvoices = useCallback(async () => {
    if (!user || isDemo) return;
    setLoading(true);

    let query = supabase
      .from("invoices")
      .select("*")
      .order("invoice_date", { ascending: false, nullsFirst: false });

    if (financialYear) {
      query = query.eq("financial_year", financialYear);
    }
    if (matchFilter === "matched") {
      query = query.eq("is_matched", true);
    } else if (matchFilter === "unmatched") {
      query = query.eq("is_matched", false);
    }
    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(
        `invoice_number.ilike.${term},supplier_name.ilike.${term},supplier_gstin.ilike.${term}`
      );
    }

    const { data, error } = await query.limit(500);

    if (!error && data) {
      let filtered = data as Invoice[];
      if (month) {
        filtered = filtered.filter((i) => invoiceMatchesMonth(i, month));
      }
      setInvoices(filtered);
    }

    setLoading(false);
  }, [user, isDemo, financialYear, month, matchFilter, search]);

  const fetchStats = useCallback(async () => {
    if (!user || isDemo) return;

    let query = supabase.from("invoices").select("*");
    if (financialYear) {
      query = query.eq("financial_year", financialYear);
    }

    const { data } = await query;
    if (data) {
      let all = data as Invoice[];
      if (month) all = all.filter((i) => invoiceMatchesMonth(i, month));
      const matched = all.filter((i) => i.is_matched);
      setStats({
        totalInvoices: all.length,
        matchedCount: matched.length,
        unmatchedCount: all.length - matched.length,
        totalItc: all.reduce((sum, i) => sum + i.igst + i.cgst + i.sgst, 0),
        totalTaxableValue: all.reduce((sum, i) => sum + i.taxable_value, 0),
      });
    }
  }, [user, isDemo, financialYear, month]);

  useEffect(() => {
    if (isDemo) {
      setInvoices(filteredDemoInvoices);
      let base = DEMO_INVOICES;
      if (financialYear) base = base.filter((i) => i.financial_year === financialYear);
      if (month) base = base.filter((i) => invoiceMatchesMonth(i, month));
      setStats(getDemoStats(base));
      setLoading(false);
      return;
    }
    fetchInvoices();
  }, [isDemo, filteredDemoInvoices, financialYear, month, fetchInvoices]);

  useEffect(() => {
    if (!isDemo) fetchStats();
  }, [isDemo, fetchStats]);

  if (authLoading || !user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Track your purchase invoices and bill attachments
          </p>
        </div>
        <button
          onClick={() => router.push("/import")}
          className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-2 self-start"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Import GSTR-2B
        </button>
      </div>

      <StatsCards stats={stats} />

      <SearchBar
        search={search}
        onSearchChange={setSearch}
        financialYear={financialYear}
        onFinancialYearChange={setFinancialYear}
        month={month}
        onMonthChange={setMonth}
        matchFilter={matchFilter}
        onMatchFilterChange={setMatchFilter}
      />

      <InvoiceTable
        invoices={invoices}
        loading={loading}
        onDeleteComplete={() => {
          fetchInvoices();
          fetchStats();
        }}
      />
    </div>
  );
}
