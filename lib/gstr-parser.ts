import * as XLSX from "xlsx";

export interface GstrInvoice {
  supplier_gstin: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  invoice_value: number;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  place_of_supply: string;
  reverse_charge: boolean;
  rate: number;
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[₹()]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function parseExcelDate(value: unknown): string {
  if (!value) return "";
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, "0");
      const d = String(date.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  const str = String(value);
  const ddmmyyyy = str.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return str;
}

/**
 * Builds a merged header from two rows (the GST portal splits headers
 * across row 4 and row 5 in the B2B sheet).
 */
function buildMergedHeaders(row1: string[], row2: string[]): string[] {
  const len = Math.max(row1.length, row2.length);
  const merged: string[] = [];
  for (let i = 0; i < len; i++) {
    const top = String(row1[i] ?? "").trim();
    const bot = String(row2[i] ?? "").trim();
    if (bot) {
      merged.push(bot);
    } else if (top) {
      merged.push(top);
    } else {
      merged.push("");
    }
  }
  return merged;
}

interface ColumnMap {
  gstin: number;
  name: number;
  invNum: number;
  invDate: number;
  invValue: number;
  pos: number;
  rc: number;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  rate: number;
}

function findCol(headers: string[], ...keywords: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const kw of keywords) {
    const idx = normalized.findIndex((h) => h.includes(kw));
    if (idx !== -1) return idx;
  }
  return -1;
}

function mapColumns(headers: string[]): { map: ColumnMap; missing: string[] } {
  const missing: string[] = [];

  const gstin = findCol(headers, "gstinofsupplier", "gstinsupplier", "gstin");
  const name = findCol(headers, "tradelegalname", "tradename", "legalname", "suppliername");
  const invNum = findCol(headers, "invoicenumber", "invoiceno", "invno", "invoicenum");
  const invDate = findCol(headers, "invoicedate", "invdate");
  const invValue = findCol(headers, "invoicevalue", "invvalue");
  const pos = findCol(headers, "placeofsupply", "placeofsupp");
  const rc = findCol(headers, "reversecharge", "supplyattractreversecharge");
  const taxableValue = findCol(headers, "taxablevalue");
  const igst = findCol(headers, "integratedtax", "igst");
  const cgst = findCol(headers, "centraltax", "cgst");
  const sgst = findCol(headers, "stateuttax", "sgstuttax", "sgst", "utgst");
  const cess = findCol(headers, "cess");
  const rate = findCol(headers, "applicableoftaxrate", "taxrate", "rate");

  if (invNum === -1) missing.push("Invoice Number");

  return {
    map: { gstin, name, invNum, invDate, invValue, pos, rc, taxableValue, igst, cgst, sgst, cess, rate },
    missing,
  };
}

export function parseGstr2bExcel(fileBuffer: ArrayBuffer): {
  invoices: GstrInvoice[];
  returnPeriod: string;
  errors: string[];
} {
  const workbook = XLSX.read(fileBuffer, { type: "array" });
  const errors: string[] = [];
  let returnPeriod = "";

  // Find the B2B sheet
  const b2bSheet = workbook.SheetNames.find((n) => {
    const norm = n.toLowerCase().replace(/[^a-z0-9]/g, "");
    return norm === "b2b" || norm.startsWith("b2b");
  });

  const sheetName = b2bSheet || workbook.SheetNames[0];
  if (!b2bSheet) {
    errors.push(
      `Could not find B2B sheet. Available sheets: ${workbook.SheetNames.join(", ")}. Using "${sheetName}".`
    );
  }

  const sheet = workbook.Sheets[sheetName];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
  });

  if (rawData.length < 3) {
    errors.push("Sheet appears to be empty or has too few rows.");
    return { invoices: [], returnPeriod, errors };
  }

  // --- Detect header rows ---
  // The GST portal format has a split header: row 4 has top-level groups,
  // row 5 has sub-column names, data starts at row 6.
  // We look for the row that contains "GSTIN" and the row that contains
  // "Invoice number" (could be the same row or the next row).

  let headerRow1Idx = -1;
  let headerRow2Idx = -1;
  let dataStartIdx = -1;

  for (let i = 0; i < Math.min(rawData.length, 20); i++) {
    const rowText = (rawData[i] as string[])
      .map((c) => normalizeHeader(String(c)))
      .join("|");

    if (
      rowText.includes("gstinofsupplier") ||
      (rowText.includes("gstin") && rowText.includes("invoice"))
    ) {
      headerRow1Idx = i;

      // Check if this same row already has "invoicenumber"
      if (rowText.includes("invoicenumber") || rowText.includes("invoiceno")) {
        dataStartIdx = i + 1;
        break;
      }

      // Otherwise check the next row for sub-headers
      if (i + 1 < rawData.length) {
        const nextRowText = (rawData[i + 1] as string[])
          .map((c) => normalizeHeader(String(c)))
          .join("|");
        if (
          nextRowText.includes("invoicenumber") ||
          nextRowText.includes("invoiceno") ||
          nextRowText.includes("invoicedate")
        ) {
          headerRow2Idx = i + 1;
          dataStartIdx = i + 2;
          break;
        }
      }

      dataStartIdx = i + 1;
      break;
    }
  }

  if (headerRow1Idx === -1) {
    // Fallback: try to find any row with "invoice" keyword
    for (let i = 0; i < Math.min(rawData.length, 20); i++) {
      const rowText = (rawData[i] as string[])
        .map((c) => normalizeHeader(String(c)))
        .join("|");
      if (rowText.includes("invoicenumber") || rowText.includes("invoiceno")) {
        headerRow1Idx = i;
        dataStartIdx = i + 1;
        break;
      }
    }
  }

  if (headerRow1Idx === -1) {
    errors.push(
      "Could not find header row with GSTIN/Invoice columns. Please check the file format."
    );
    return { invoices: [], returnPeriod, errors };
  }

  // Extract return period from early rows
  for (let i = 0; i < Math.min(headerRow1Idx, 10); i++) {
    const cellText = (rawData[i] as string[]).map((c) => String(c)).join(" ");
    const periodMatch = cellText.match(/(\d{2}\/\d{4})/);
    if (periodMatch) {
      returnPeriod = periodMatch[1].replace("/", "");
    }
  }

  // Build final headers
  let headers: string[];
  if (headerRow2Idx !== -1) {
    headers = buildMergedHeaders(
      rawData[headerRow1Idx] as string[],
      rawData[headerRow2Idx] as string[]
    );
  } else {
    headers = (rawData[headerRow1Idx] as string[]).map(String);
  }

  const { map: col, missing } = mapColumns(headers);

  if (missing.length > 0) {
    errors.push(
      `Could not find columns: ${missing.join(", ")}. Headers found: ${headers.filter(Boolean).join(", ")}`
    );
    if (col.invNum === -1) {
      return { invoices: [], returnPeriod, errors };
    }
  }

  // Parse data rows
  const invoices: GstrInvoice[] = [];
  const dataRows = rawData.slice(dataStartIdx);

  for (const row of dataRows) {
    const cells = row as unknown[];
    if (!cells || cells.length < 3) continue;

    const invNum = col.invNum >= 0 ? String(cells[col.invNum] ?? "").trim() : "";
    if (!invNum) continue;

    // Skip total/summary rows
    const invNumLower = invNum.toLowerCase();
    if (invNumLower.includes("total") || invNumLower.includes("grand")) continue;

    const gstin = col.gstin >= 0 ? String(cells[col.gstin] ?? "").trim() : "";

    // Skip invoices with value less than 2000
    const invValue = col.invValue >= 0 ? toNumber(cells[col.invValue]) : 0;
    if (invValue < 2000) continue;

    invoices.push({
      supplier_gstin: gstin,
      supplier_name: col.name >= 0 ? String(cells[col.name] ?? "").trim() : "",
      invoice_number: invNum,
      invoice_date: col.invDate >= 0 ? parseExcelDate(cells[col.invDate]) : "",
      invoice_value: col.invValue >= 0 ? toNumber(cells[col.invValue]) : 0,
      taxable_value: col.taxableValue >= 0 ? toNumber(cells[col.taxableValue]) : 0,
      igst: col.igst >= 0 ? toNumber(cells[col.igst]) : 0,
      cgst: col.cgst >= 0 ? toNumber(cells[col.cgst]) : 0,
      sgst: col.sgst >= 0 ? toNumber(cells[col.sgst]) : 0,
      cess: col.cess >= 0 ? toNumber(cells[col.cess]) : 0,
      place_of_supply: col.pos >= 0 ? String(cells[col.pos] ?? "").trim() : "",
      reverse_charge:
        col.rc >= 0 ? String(cells[col.rc]).toLowerCase().startsWith("y") : false,
      rate: col.rate >= 0 ? toNumber(cells[col.rate]) : 0,
    });
  }

  return { invoices, returnPeriod, errors };
}
