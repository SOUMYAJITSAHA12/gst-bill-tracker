"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import BulkBillUploader from "@/components/BulkBillUploader";

export default function AttachBillsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  if (authLoading || !user) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attach Bills</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload Flipkart ZIP, Amazon/Samsung PDFs — invoice numbers are
          auto-detected and matched with your GSTR-2B invoices
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-medium text-gray-900 mb-1">How it works</h2>
        <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
          <li>First import your GSTR-2B Excel from the Import page</li>
          <li>Download your purchase bills (Flipkart ZIP, Amazon/Samsung PDFs)</li>
          <li>Upload them below — invoice numbers are auto-detected from the PDF</li>
          <li>Review the matches and click &quot;Attach&quot; to link bills to invoices</li>
        </ol>
      </div>

      <BulkBillUploader />
    </div>
  );
}
