export interface Invoice {
  id: string;
  import_id: string | null;
  invoice_number: string;
  invoice_date: string | null;
  supplier_gstin: string;
  supplier_name: string;
  invoice_value: number;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  place_of_supply: string | null;
  reverse_charge: boolean;
  rate: number;
  financial_year: string;
  return_period: string | null;
  pdf_path: string | null;
  external_link: string | null;
  is_matched: boolean;
  notes: string | null;
  matched_by: string | null;
  matched_at: string | null;
  created_at: string;
}

export interface GstrImport {
  id: string;
  file_name: string;
  return_period: string | null;
  financial_year: string;
  invoice_count: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface DashboardStats {
  totalInvoices: number;
  matchedCount: number;
  unmatchedCount: number;
  totalItc: number;
  totalTaxableValue: number;
}
