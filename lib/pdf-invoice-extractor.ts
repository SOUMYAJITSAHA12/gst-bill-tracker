let pdfjsReady: Promise<typeof import("pdfjs-dist")> | null = null;

function getPdfjs() {
  if (!pdfjsReady) {
    pdfjsReady = import("pdfjs-dist").then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return mod;
    });
  }
  return pdfjsReady;
}

export async function extractTextFromPdf(
  pdfData: ArrayBuffer
): Promise<string> {
  const pdfjsLib = await getPdfjs();
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const textParts: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(" ");
    textParts.push(pageText);
  }

  return textParts.join("\n");
}

const DATE_PATTERN = /^\d{2}[-\/]\d{2}[-\/]\d{4}$/;

function isDateLike(val: string): boolean {
  return DATE_PATTERN.test(val.trim());
}

const INVOICE_PATTERNS: RegExp[] = [
  // Flipkart GTA: "Tax Invoice Number : NBAA327001141936"
  /Tax\s*Invoice\s*Number\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  // Flipkart GTA reversed column layout: ": NBAA327001141936  Tax Invoice Number"
  /:\s*([A-Z0-9][A-Z0-9\-\/]+)\s+Tax\s*Invoice\s*Number/i,
  // Flipkart Bill of Supply: "Bill of Supply Number : NBAA327000887477"
  /Bill\s*of\s*Supply\s*Number\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  // Flipkart Bill of Supply reversed: ": NBAA327000887477  Bill of Supply Number"
  /:\s*([A-Z0-9][A-Z0-9\-\/]+)\s+Bill\s*of\s*Supply\s*Number/i,
  // Flipkart product invoices: "Invoice Number # LIAAE1L270000652"
  /Invoice\s*Number\s*#\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  // Samsung / Amazon: "Invoice Number: 20E5I6001001" or "Invoice Number : CCX1-14391"
  /Invoice\s*Number\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  // Invoice Details format (Amazon): "Invoice Details : WB-CCX1-1224631255-2627"
  /Invoice\s*Details\s*:\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
];

export function extractInvoiceNumber(text: string): string | null {
  const all = extractAllInvoiceNumbers(text);
  return all.length > 0 ? all[0] : null;
}

export function extractAllInvoiceNumbers(text: string): string[] {
  const found = new Set<string>();

  for (const pattern of INVOICE_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, "gi");
    let match;
    while ((match = globalPattern.exec(text)) !== null) {
      const val = match[1]?.trim();
      if (val && !isDateLike(val)) {
        found.add(val);
      }
    }
  }

  return Array.from(found);
}

export interface ExtractedBill {
  fileName: string;
  invoiceNumber: string | null;
  pdfBlob: Blob;
  matchedInvoiceId?: string;
  matchStatus: "matched" | "unmatched" | "pending" | "already_attached" | "duplicate";
}

export async function extractBillsFromZip(
  zipFile: File
): Promise<ExtractedBill[]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(zipFile);
  const bills: ExtractedBill[] = [];

  const pdfEntries = Object.entries(zip.files).filter(
    ([name]) => name.toLowerCase().endsWith(".pdf") && !name.startsWith("__MACOSX")
  );

  for (const [name, entry] of pdfEntries) {
    try {
      const data = await entry.async("arraybuffer");
      const pdfBlob = new Blob([data], { type: "application/pdf" });
      const copyForParsing = data.slice(0);
      const text = await extractTextFromPdf(copyForParsing);
      const invoiceNumbers = extractAllInvoiceNumbers(text);

      if (invoiceNumbers.length === 0) {
        bills.push({
          fileName: name,
          invoiceNumber: null,
          pdfBlob,
          matchStatus: "pending",
        });
      } else {
        for (const invNum of invoiceNumbers) {
          bills.push({
            fileName: name,
            invoiceNumber: invNum,
            pdfBlob,
            matchStatus: "pending",
          });
        }
      }
    } catch {
      // Skip PDFs that fail to parse but still include them with no invoice number
      try {
        const data = await entry.async("arraybuffer");
        bills.push({
          fileName: name,
          invoiceNumber: null,
          pdfBlob: new Blob([data], { type: "application/pdf" }),
          matchStatus: "pending",
        });
      } catch {
        // Skip entirely if even reading fails
      }
    }
  }

  return bills;
}

export async function extractBillFromPdf(
  file: File
): Promise<ExtractedBill[]> {
  const data = await file.arrayBuffer();
  const copyForParsing = data.slice(0);
  const text = await extractTextFromPdf(copyForParsing);
  const invoiceNumbers = extractAllInvoiceNumbers(text);
  const pdfBlob = new Blob([data], { type: "application/pdf" });

  if (invoiceNumbers.length === 0) {
    return [{
      fileName: file.name,
      invoiceNumber: null,
      pdfBlob,
      matchStatus: "pending",
    }];
  }

  return invoiceNumbers.map((invNum) => ({
    fileName: file.name,
    invoiceNumber: invNum,
    pdfBlob,
    matchStatus: "pending",
  }));
}
