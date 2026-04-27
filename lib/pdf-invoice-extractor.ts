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
  // Flipkart GTA: "Tax Invoice Number : NBAA327001141936" (must be before generic)
  /Tax\s*Invoice\s*Number\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  // Flipkart GTA reversed column layout: ": NBAA327001141936  Tax Invoice Number"
  /:\s*([A-Z0-9][A-Z0-9\-\/]+)\s+Tax\s*Invoice\s*Number/i,
  // Flipkart product invoices: "Invoice Number # LIAAE1L270000652"
  /Invoice\s*Number\s*#\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  // Samsung / Amazon: "Invoice Number: 20E5I6001001" or "Invoice Number : CCX1-14391"
  /Invoice\s*Number\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  // Invoice Details format (Amazon): "Invoice Details : WB-CCX1-1224631255-2627"
  /Invoice\s*Details\s*:\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
];

export function extractInvoiceNumber(text: string): string | null {
  for (const pattern of INVOICE_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1] && !isDateLike(match[1])) {
      return match[1].trim();
    }
  }
  return null;
}

export interface ExtractedBill {
  fileName: string;
  invoiceNumber: string | null;
  pdfBlob: Blob;
  matchedInvoiceId?: string;
  matchStatus: "matched" | "unmatched" | "pending" | "already_attached";
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
    const data = await entry.async("arraybuffer");
    const pdfBlob = new Blob([data], { type: "application/pdf" });
    const copyForParsing = data.slice(0);
    const text = await extractTextFromPdf(copyForParsing);
    const invoiceNumber = extractInvoiceNumber(text);

    bills.push({
      fileName: name,
      invoiceNumber,
      pdfBlob,
      matchStatus: "pending",
    });
  }

  return bills;
}

export async function extractBillFromPdf(
  file: File
): Promise<ExtractedBill> {
  const data = await file.arrayBuffer();
  const copyForParsing = data.slice(0);
  const text = await extractTextFromPdf(copyForParsing);
  const invoiceNumber = extractInvoiceNumber(text);

  return {
    fileName: file.name,
    invoiceNumber,
    pdfBlob: new Blob([data], { type: "application/pdf" }),
    matchStatus: "pending",
  };
}
