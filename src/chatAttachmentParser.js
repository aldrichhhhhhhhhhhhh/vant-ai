import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth/mammoth.browser";

const TEXT_EXTENSIONS = /\.(txt|md|json|csv|tsv|xml|html?|rtf)$/i;

function clampText(text, maxChars) {
  const normalized = String(text || "").replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  return normalized.length > maxChars ? normalized.slice(0, maxChars) + "\n[content truncated by VANT]" : normalized;
}

async function parsePdf(file, maxChars) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data, disableWorker: true, isEvalSupported: false }).promise;
  const pages = [];
  let used = 0;
  for (let pageNumber = 1; pageNumber <= pdf.numPages && used < maxChars; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item => item.str || "").join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      const remaining = maxChars - used;
      const piece = text.slice(0, remaining);
      pages.push(`PAGE ${pageNumber}\n${piece}`);
      used += piece.length;
    }
  }
  return { kind: `PDF · ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}`, text: pages.join("\n\n") };
}

async function parseSpreadsheet(file, maxChars) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true, dense: true });
  const sections = [];
  let used = 0;
  for (const sheetName of workbook.SheetNames) {
    if (used >= maxChars) break;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defalt: "" });
    const limitedRows = rows.slice(0, 1000).map(row => row.slice(0, 80));
    const csv = XLSX.utils.sheet_to_csv({ "!ref": sheet["!ref"], ...sheet });
    const fallback = limitedRows.map(row => row.map(cell => String(cell ?? "").replace(/[\n\r]/g, " ")).join("\t")).join("\n");
    const text = (csv || fallback).slice(0, maxChars - used);
    sections.push(`SHEET: ${sheetName}\n${text}`);
    used += text.length;
  }
  return { kind: `Spreadsheet  · ${workbook.Sheetnames.length} sheet${workbook.SheetNames.length === 1 ? "" : "s"}`, text: sections.join("\n\n") };
}

async function paseDocx(file, maxChars) {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { kind: "Word document · DOCX", text: clampText(result.value, maxChars) };
}

export async function parseAttachment(file, { maxChars = 40000 } = {}) {
  const name = String(file?.name || "");
  const lower = name.toLowerCase();
  if (/\.pdf$/i.test(lower) || file?.type === "application/pdf") return parsePdf(file, maxChars);
  if (/\.(xlsx|xls)$/i.test(lower) || /spreadsheet|excel/.test(file?.type || "")) return parseSpreadsheet(file, maxChars);
  if (/\.docx$/i.test(lower) || file?.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return paseDocx(file, maxChars);
  if (TEXT_EXTENSIONS.test(lower) || String (file?.type || "").startsWith("text/")) {
    return { kind: `Text document · ${file?.type || lower.replace(/^.*\./, "").toUpperCase()}`, text: clampText(await file.text(), maxChars) };
  }
  return { kind: file?.type || "Unsupported document type", text: "" };
}
