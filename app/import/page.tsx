"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";
import GstrUploader from "@/components/GstrUploader";
import { GstrImport } from "@/lib/types";
import { DEMO_IMPORTS } from "@/lib/demo-data";
import { formatDate } from "@/lib/utils";

export default function ImportPage() {
  const { user, loading: authLoading, isDemo } = useAuth();
  const router = useRouter();
  const [imports, setImports] = useState<GstrImport[]>([]);
  const [loadingImports, setLoadingImports] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  async function fetchImports() {
    if (isDemo) {
      setImports(DEMO_IMPORTS);
      setLoadingImports(false);
      return;
    }
    const { data } = await supabase
      .from("gstr_imports")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setImports(data as GstrImport[]);
    setLoadingImports(false);
  }

  useEffect(() => {
    if (user) fetchImports();
  }, [user]);

  if (authLoading || !user) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import GSTR-2B</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload your GSTR-2B Excel file downloaded from the GST portal
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-medium text-gray-900 mb-1">
          How to download GSTR-2B
        </h2>
        <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
          <li>
            Go to{" "}
            <a
              href="https://gst.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              gst.gov.in
            </a>{" "}
            and login with your credentials
          </li>
          <li>Navigate to Returns &gt; GSTR-2B</li>
          <li>Select the return period (month/year)</li>
          <li>Click &quot;Download&quot; and choose Excel format</li>
          <li>Upload the downloaded file below</li>
        </ol>
      </div>

      <GstrUploader onImportComplete={fetchImports} />

      {/* Import history */}
      <div>
        <h2 className="font-medium text-gray-900 mb-3">Import History</h2>
        {loadingImports ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <div className="animate-spin w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : imports.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
            No imports yet. Upload your first GSTR-2B file above.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {imports.map((imp) => (
              <div key={imp.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {imp.file_name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {imp.invoice_count} invoices
                    {imp.return_period && ` | Period: ${imp.return_period}`}
                    {" | FY "}
                    {imp.financial_year}
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  {formatDate(imp.created_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
