"use client";

import { DashboardStats } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function StatsCards({ stats }: { stats: DashboardStats }) {
  const matchPct =
    stats.totalInvoices > 0
      ? Math.round((stats.matchedCount / stats.totalInvoices) * 100)
      : 0;

  const cards = [
    {
      label: "Total Invoices",
      value: stats.totalInvoices.toString(),
      sub: "from GSTR-2B imports",
      color: "bg-blue-50 text-blue-700 border-blue-200",
    },
    {
      label: "Bills Attached",
      value: stats.matchedCount.toString(),
      sub: `${matchPct}% matched`,
      color: "bg-green-50 text-green-700 border-green-200",
    },
    {
      label: "Bills Missing",
      value: stats.unmatchedCount.toString(),
      sub: "need attention",
      color:
        stats.unmatchedCount > 0
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-green-50 text-green-700 border-green-200",
    },
    {
      label: "Total ITC",
      value: formatCurrency(stats.totalItc),
      sub: `Taxable: ${formatCurrency(stats.totalTaxableValue)}`,
      color: "bg-purple-50 text-purple-700 border-purple-200",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl border p-4 ${card.color}`}
        >
          <p className="text-xs font-medium opacity-80 uppercase tracking-wide">
            {card.label}
          </p>
          <p className="mt-1 text-2xl font-bold">{card.value}</p>
          <p className="mt-0.5 text-xs opacity-70">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
