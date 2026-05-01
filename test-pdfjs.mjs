import { readFileSync } from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = 'C:\\Users\\ssaha384\\AppData\\Local\\Temp\\flipkart-bills4\\2026-02-14_OD336760333650711100.pdf';
const data = readFileSync(pdfPath);

const doc = await pdfjsLib.getDocument({ data: new Uint8Array(data.buffer) }).promise;
const textParts = [];

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  const pageText = content.items.map((item) => item.str).join(" ");
  textParts.push(pageText);
}

const text = textParts.join("\n");

console.log("=== FULL EXTRACTED TEXT ===");
console.log(text);
console.log("\n=== SEARCHING FOR PATTERNS ===");

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

const found = new Set();
for (const pattern of INVOICE_PATTERNS) {
  const globalPattern = new RegExp(pattern.source, "gi");
  let match;
  while ((match = globalPattern.exec(text)) !== null) {
    const val = match[1]?.trim();
    if (val && !isDateLike(val)) {
      found.add(val);
      console.log(`Pattern: ${pattern.source.substring(0, 50)}... => "${val}"`);
    }
  }
}

console.log("\nAll found:", Array.from(found));
console.log("Expected: FAT5072600015481, FBF8826013792349, FAJFMM2600020244, FAAAI26015265644");
