import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth/mammoth.browser";

const TEXT_EXTENSIONS = /\.(txt|md|json|csv|tsv|xml|html?|rtf)$/i;

function clampText(value, maxChars) {
  const text = String(value || "").replace(/\u0000/g, "").replace(/\r\n/g, "\n").trim();
  return text.length > maxChars ? text.slice(0, maxChars) + "\n[content truncated by VANT]" : text;
}

async function parsePdf(file, maxChars) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data: data, disableWorker: true, isEvalSupported: false }).promise;
  const pages = [];
  let used = 0;
  for (let pageNumber = 1; pageNumber <= pdf.numPages && used < maxChars; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map(function(item) { return item.str || ""; }).join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      const piece = text.slice(0, maxChars - used);
      pages.push("PAGE " + pageNumber + "\n" + piece);
      used += piece.length;
    }
  }
  return { kind: "PDF (" + pdf.numPages + " pages)", text: pages.join("\n\n") };
}

async function parseSpreadsheet(file, maxChars) {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, dense: true });
  const sections = [];
  let used = 0;
  for (const sheetName of workbook.SheetNames) {
    if (used >= maxChars) break;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
    const limited = rows.slice(0, 1000).map(function(row) {
      return row.slice(0, 80).map(function(cell) { return String(cell == null ? "" : cell).replace(/[\n\r]/g, " "); });
    });
    const text = limited.map(function(row) { return row.join("\t"); }).join("\n").slice(0, maxChars - used);
    sections.push("SHEET: " + sheetName + "\n" + text);
    used += text.length;
  }
  return { kind: "Spreadsheet (" + workbook.SheetNames.length + " sheets)", text: sections.join("\n\n") };
}

async function parseDocx(file, maxChars) {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { kind: "Word document (DOCX)", text: clampText(result.value, maxChars) };
}

export async function parseAttachment(file, options) {
  const maxChars = options && options.maxChars ? options.maxChars : 40000;
  const name = String(file && file.name || "");
  const lower = name.toLowerCase();
  const type = String(file && file.type || "");

  if (/\.pdf$/i.test(lower) || type === "application/pdf") return parsePdf(file, maxChars);
  if (/\.(xlsx|xls)$/i.test(lower) || /spreadsheet|excel/i.test(type)) return parseSpreadsheet(file, maxChars);
  if (/\.docx$/i.test(lower) || type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return parseDocx(file, maxChars);
  if (TEXT_EXTENSIONS.test(lower) || type.indexOf("text/") === 0) {
    return { kind: "Text document", text: clampText(await file.text(), maxChars) };
  }
  return { kind: type || "Unsupported document type", text: "" };
}
