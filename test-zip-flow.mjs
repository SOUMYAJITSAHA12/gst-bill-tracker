import { readFileSync } from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import JSZip from 'jszip';

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
      if (val && !isDateLike(val)) found.add(val);
    }
  }
  return Array.from(found);
}

async function extractTextFromPdf(pdfData) {
  const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const textParts = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item) => item.str).join(" ");
    textParts.push(pageText);
  }
  return textParts.join("\n");
}

// Simulate extractBillsFromZip exactly as the app does
const zipPath = 'C:\\Users\\ssaha384\\OneDrive - PwC\\Downloads\\flipkart-invoices-df6b305e6f4f.zip';
const zipData = readFileSync(zipPath);
const zip = await JSZip.loadAsync(zipData);

const pdfEntries = Object.entries(zip.files).filter(
  ([name]) => name.toLowerCase().endsWith('.pdf') && !name.startsWith('__MACOSX')
);

console.log(`Found ${pdfEntries.length} PDFs in ZIP\n`);

const bills = [];
for (const [name, entry] of pdfEntries) {
  try {
    const data = await entry.async('arraybuffer');
    const copyForParsing = data.slice(0);
    const text = await extractTextFromPdf(copyForParsing);
    const invoiceNumbers = extractAllInvoiceNumbers(text);

    if (invoiceNumbers.length === 0) {
      bills.push({ fileName: name, invoiceNumber: null });
      console.log(`  ${name} => NO invoice detected`);
    } else {
      for (const invNum of invoiceNumbers) {
        bills.push({ fileName: name, invoiceNumber: invNum });
      }
      console.log(`  ${name} => ${invoiceNumbers.length} invoice(s): ${invoiceNumbers.join(', ')}`);
    }
  } catch (err) {
    console.log(`  ${name} => ERROR: ${err.message}`);
    bills.push({ fileName: name, invoiceNumber: null });
  }
}

console.log(`\n=== SUMMARY ===`);
console.log(`Total PDFs in ZIP: ${pdfEntries.length}`);
console.log(`Total bill entries (UI rows): ${bills.length}`);
console.log(`Bills with invoice #: ${bills.filter(b => b.invoiceNumber).length}`);
console.log(`Bills without invoice #: ${bills.filter(b => !b.invoiceNumber).length}`);

// Check the specific multi-invoice PDF
const multiInvBills = bills.filter(b => b.fileName.includes('OD336760333650711100'));
console.log(`\n=== Multi-invoice PDF (OD336760333650711100) ===`);
console.log(`Entries created: ${multiInvBills.length}`);
multiInvBills.forEach(b => console.log(`  -> ${b.invoiceNumber}`));
