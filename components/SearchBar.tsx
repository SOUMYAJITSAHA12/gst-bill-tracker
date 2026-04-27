"use client";

import { generateFinancialYears } from "@/lib/utils";

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

interface SearchBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  financialYear: string;
  onFinancialYearChange: (value: string) => void;
  month: string;
  onMonthChange: (value: string) => void;
  matchFilter: "all" | "matched" | "unmatched";
  onMatchFilterChange: (value: "all" | "matched" | "unmatched") => void;
}

export default function SearchBar({
  search,
  onSearchChange,
  financialYear,
  onFinancialYearChange,
  month,
  onMonthChange,
  matchFilter,
  onMatchFilterChange,
}: SearchBarProps) {
  const financialYears = generateFinancialYears();

  return (
    <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
      <div className="flex-1 min-w-[200px] relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          placeholder="Search invoice number, supplier name, or GSTIN..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      <select
        value={financialYear}
        onChange={(e) => onFinancialYearChange(e.target.value)}
        className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Years</option>
        {financialYears.map((fy) => (
          <option key={fy} value={fy}>
            FY {fy}
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onMonthChange(e.target.value)}
        className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All Months</option>
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      <select
        value={matchFilter}
        onChange={(e) =>
          onMatchFilterChange(e.target.value as "all" | "matched" | "unmatched")
        }
        className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">All Status</option>
        <option value="matched">Bills Attached</option>
        <option value="unmatched">Bills Missing</option>
      </select>
    </div>
  );
}
