#!/usr/bin/env node
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");
const { inflateRawSync } = require("zlib");

const root = join(__dirname, "..");
const archivePath = join(root, "vant-ai-ux-upgrade.zip");
const targetPath = join(root, "src", "App.jsx");
const wanted = "vant-ai-ux/src/App.jsx";

function findEndOfCentralDirectory(buf) {
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 0xffff - 22); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("VANT restore: ZIP end-of-central-directory record not found.");
}

function extractFile(zip, wantedName) {
  const eocd = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(eocd + 10);
  const centralOffset = zip.readUInt32LE(eocd + 16);
  let cursor = centralOffset;

  for (let i = 0; i < entryCount; i++) {
    if (zip.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("VANT restore: invalid ZIP central-directory entry.");
    }

    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const fileNameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localHeaderOffset = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + fileNameLength).toString("utf8");

    if (name === wantedName) {
      if (flags & 0x1) throw new Error("VANT restore: encrypted ZIP entries are not supported.");
      if (zip.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error("VANT restore: invalid ZIP local-file header.");
      }

      const localNameLength = zip.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = zip.subarray(dataStart, dataStart + compressedSize);

      if (method === 0) return Buffer.from(compressed);
      if (method === 8) return inflateRawSync(compressed);
      throw new Error("VANT restore: unsupported ZIP compression method " + method + ".");
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error("VANT restore: " + wantedName + " was not found in " + archivePath + ".");
}

function patchAiChat(appSource) {
  let source = appSource;

  source = source.replace(
    'import Papa from "papaparse";',
    'import Papa from "papaparse";\nimport { parseAttachment } from "./chatAttachmentParser";'
  );

  source = source.replace(
    'accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.txt,.md,.json,image/*"',
    'accept=".pdf,.csv,.tsv,.xlsx,.xls,.doc,.docx,.txt,.md,.json,.xml,.html,.htm,.rtf,image/*"'
  );

  source = source.replace(
    '  function AttachmentPreview({ file, theme, isDark, size = 58 }) {',
    '  function AttachmentPreview({ file, theme, isDark, size = 58 }) {'
  );

  source = source.replace(
    '      if (!file || !file.type?.startsWith("image/")) {',
    '      if (!file || !(file.type?.startsWith("image/") || /\\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(file.name || ""))) {'
  );

  const start = source.indexOf('  async function buildUserContent(text) {');
  const end = source.indexOf('\n  function displayText(content) {', start);

  if (start < 0 || end < 0) {
    throw new Error("VANT restore: buildUserContent patch anchors were not found.");
  }

  const replacement = `  async function buildUserContent(text) {
    const parts = [];
    const cleanText = String(text || "").trim();
    if (cleanText) parts.push({ type: "text", text: cleanText });

    for (const file of attachments) {
      const meta = \`Attachment: \${file.name} (\${Math.max(1, Math.round(file.size / 1024))} KB)\`;
      const isImage =
        file.type?.startsWith("image/") ||
        /\\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(file.name || "");

      if (isImage) {
        try {
          const prepared = await prepareImageForModel(file);
          parts.push({
            type: "text",
            text: \`\${meta}. Inspect the attached image and use it as evidence for the user's request.\`,
          });
          parts.push({
            type: "image_url",
            image_url: { url: prepared.dataUrl },
          });
        } catch {
          parts.push({
            type: "text",
            text: \`\${meta}. The image could not be prepared for analysis.\`,
          });
        }
        continue;
      }

      /*
       * Keep document contents OUT of the visible chat bubble.
       * The attachment parser runs here and the resulting context is
       * marked so ChatMessageContent can hide it while the model still
       * receives it as a normal text part.
       */
      try {
        const parsed = await parseAttachment(file, { maxChars: 40000 });
        if (parsed?.text) {
          parts.push({
            type: "text",
            text: \`\${meta}\\n[VANT_ATTACHMENT_CONTEXT]\\nTYPE: \${parsed.kind}\\n\${parsed.text}\\n[/VANT_ATTACHMENT_CONTEXT]\`,
          });
        } else {
          parts.push({
            type: "text",
            text: \`\${meta}\\n[attachment content could not be extracted in the browser]\`,
          });
        }
      } catch (error) {
        parts.push({
          type: "text",
          text: \`\${meta}\\n[attachment parsing failed: \${error?.message || "unknown parser error"}]\`,
        });
      }
    }

    if (webSearch) {
      parts.push({
        type: "text",
        text: "WEB SEARCH REQUESTED: Do not invent web results. If live web access is unavailable, state that clearly.",
      });
    }

    return parts;
  }
`;

  source = source.slice(0, start) + replacement + source.slice(end);

  source = source.replace(
    '  if (!cleanText || loading) {',
    '  if ((!cleanText && attachments.length === 0) || loading) {'
  );

  const oldTextParts =
    '    const textParts = content.filter((part) => part?.type === "text");\n    const text = textParts.map((part) => part?.text || "").filter(Boolean).join("\\n");';

  const newTextParts =
    '    const textParts = content.filter((part) => part?.type === "text" && !/\\[VANT_ATTACHMENT_CONTEXT\\][\\s\\S]*?\\[\\/VANT_ATTACHMENT_CONTEXT\\]/.test(part?.text || ""));\n    const text = textParts.map((part) => part?.text || "").filter(Boolean).join("\\n");';

  if (!source.includes(oldTextParts)) {
    throw new Error("VANT restore: ChatMessageContent text filter anchor was not found.");
  }

  source = source.replace(oldTextParts, newTextParts);

  return source;
}

const zip = readFileSync(archivePath);
let app = extractFile(zip, wanted).toString("utf8");

if (!app.includes("export default")) {
  throw new Error("VANT restore: extracted App.jsx does not look like a React entry.");
}

app = patchAiChat(app);

mkdirSync(join(root, "src"), { recursive: true });
writeFileSync(targetPath, app);

console.log(
  "VANT restore: loaded " +
    wanted +
    " -> src/App.jsx (" +
    Buffer.byteLength(app) +
    " bytes, " +
    app.split("\\n").length +
    " lines) with AI Chat attachment patch."
);
