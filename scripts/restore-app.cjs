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

const zip = readFileSync(archivePath);
const app = extractFile(zip, wanted);

if (!app.toString("utf8").includes("export default")) {
  throw new Error("VANT restore: extracted App.jsx does not look like a React entry.");
}

mkdirSync(join(root, "src"), { recursive: true });
writeFileSync(targetPath, app);

console.log(
  "VANT restore: loaded " +
    wanted +
    " -> src/App.jsx (" +
    app.length +
    " bytes, " +
    app.toString("utf8").split("\n").length +
    " lines)."
);
