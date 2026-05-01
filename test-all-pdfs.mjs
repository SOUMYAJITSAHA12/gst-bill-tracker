import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const DIR = 'C:\\Users\\ssaha384\\AppData\\Local\\Temp\\flipkart-bills4';

const DATE_PATTERN = /^\d{2}[-\/]\d{2}[-\/]\d{4}$/;
function isDateLike(val) { return DATE_PATTERN.test(val.trim()); }

const INVOICE_PATTERNS = [
  /Tax\s*Invoice\s*Number\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  /:\s*([A-Z0-9][A-Z0-9\-\/]+)\s+Tax\s*Invoice\s*Number/i,
  /Bill\s*of\s*Supply\s*Number\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  /:\s*([A-Z0-9][A-Z0-9\-\/]+)\s+Bill\s*of\s*Supply\s*Number/i,
  /Invoice\s*Number\s*#\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  /Invoice\s*Number\s*:?\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
  /Invoice\s*Details\s*:\s*([A-Z0-9][A-Z0-9\-\/]+)/i,
];

function extractAllInvoiceNumbers(text) {
  const found = new Set();
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

const files = readdirSync(DIR).filter(f => f.endsWith('.pdf')).sort();
let totalBillEntries = 0;

for (const file of files) {
  const data = readFileSync(join(DIR, file));
  try {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data.buffer) }).promise;
    const textParts = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str).join(" ");
      textParts.push(pageText);
    }
    const text = textParts.join("\n");
    const invoiceNumbers = extractAllInvoiceNumbers(text);
    const entries = invoiceNumbers.length === 0 ? 1 : invoiceNumbers.length;
    totalBillEntries += entries;
    console.log(`${file} => ${invoiceNumbers.length} invoices: [${invoiceNumbers.join(', ')}]`);
  } catch (err) {
    totalBillEntries += 1;
    console.log(`${file} => ERROR: ${err.message}`);
  }
}

console.log(`\nTotal PDF files: ${files.length}`);
console.log(`Total bill entries (rows in UI): ${totalBillEntries}`);
