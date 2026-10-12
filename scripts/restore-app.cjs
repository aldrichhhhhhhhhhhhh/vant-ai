#!/usr/bin/env node
const { readFileSync, existsSync } = require("fs");
const { join } = require("path");

const targetPath = join(__dirname, "..", "src", "App.jsx");

if (!existsSync(targetPath)) {
  console.error("VANT preflight failed: src/App.jsx is missing.");
  process.exit(1);
}

const source = readFileSync(targetPath, "utf8");

// Never fetch source during a build. Builds must use the exact source committed
// to the branch so GitHub rate limits or stale snapshots cannot replace it.
if (source.length < 10000 ||
    !source.includes("function StudyResourceTool") ||
    !source.includes("function ToolsPage")) {
  console.error("VANT preflight failed: src/App.jsx is incomplete or is a placeholder.");
  console.error("Restore the complete application source in Git before building.");
  process.exit(1);
}

console.log("VANT preflight: complete committed src/App.jsx found (" +
  Buffer.byteLength(source) + " bytes).");
