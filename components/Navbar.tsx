"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthProvider";
import { useState } from "react";

export default function Navbar() {
  const { user, signOut, isDemo } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/import", label: "Import GSTR-2B" },
    { href: "/attach-bills", label: "Attach Bills" },
    { href: "/summary", label: "Summary" },
  ];

  return (
    <>
    {isDemo && (
      <div className="bg-amber-500 text-white text-center text-xs py-1.5 font-medium">
        DEMO MODE — Showing sample data. Connect Supabase to use the real app.
      </div>
    )}
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">GST</span>
              </div>
              <span className="font-semibold text-gray-900 hidden sm:block">
                Bill Tracker
              </span>
            </Link>
            <div className="hidden sm:flex ml-8 gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-sm text-gray-500">{user.email}</span>
            <button
              onClick={signOut}
              className="text-sm text-gray-600 hover:text-red-600 font-medium transition-colors"
            >
              Sign Out
            </button>
          </div>
          <div className="sm:hidden flex items-center">
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 rounded-md text-gray-600 hover:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>
      {mobileOpen && (
        <div className="sm:hidden border-t border-gray-200 bg-white">
          <div className="px-4 py-3 space-y-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-md text-sm font-medium ${
                  pathname === link.href
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-gray-100">
              <p className="px-3 text-sm text-gray-500">{user.email}</p>
              <button
                onClick={signOut}
                className="mt-2 px-3 py-2 text-sm text-red-600 font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
    </>
  );
}
