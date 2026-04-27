-- ============================================
-- GST Bill Tracker - Supabase Database Setup
-- Run this SQL in Supabase Dashboard > SQL Editor
-- ============================================

-- Table: gstr_imports (tracks each GSTR-2B file upload)
CREATE TABLE gstr_imports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  return_period TEXT,
  financial_year TEXT NOT NULL,
  invoice_count INTEGER DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: invoices (each invoice entry parsed from GSTR-2B)
CREATE TABLE invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID REFERENCES gstr_imports(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE,
  supplier_gstin TEXT NOT NULL DEFAULT '',
  supplier_name TEXT NOT NULL DEFAULT '',
  invoice_value DECIMAL(15,2) DEFAULT 0,
  taxable_value DECIMAL(15,2) DEFAULT 0,
  igst DECIMAL(15,2) DEFAULT 0,
  cgst DECIMAL(15,2) DEFAULT 0,
  sgst DECIMAL(15,2) DEFAULT 0,
  cess DECIMAL(15,2) DEFAULT 0,
  place_of_supply TEXT,
  reverse_charge BOOLEAN DEFAULT false,
  rate DECIMAL(5,2) DEFAULT 0,
  financial_year TEXT NOT NULL,
  return_period TEXT,
  pdf_path TEXT,
  external_link TEXT,
  is_matched BOOLEAN DEFAULT false,
  notes TEXT,
  matched_by UUID REFERENCES auth.users(id),
  matched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(supplier_gstin, invoice_number)
);

-- Indexes for fast search
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_supplier_gstin ON invoices(supplier_gstin);
CREATE INDEX idx_invoices_financial_year ON invoices(financial_year);
CREATE INDEX idx_invoices_is_matched ON invoices(is_matched);
CREATE INDEX idx_invoices_invoice_date ON invoices(invoice_date);

-- Row Level Security (RLS) - restrict access to authenticated users only
ALTER TABLE gstr_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read gstr_imports"
  ON gstr_imports FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert gstr_imports"
  ON gstr_imports FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (true);

-- Storage bucket for bill PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('bills', 'bills', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload bills"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'bills');

CREATE POLICY "Authenticated users can read bills"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'bills');

CREATE POLICY "Authenticated users can update bills"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'bills');

CREATE POLICY "Authenticated users can delete bills"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'bills');
