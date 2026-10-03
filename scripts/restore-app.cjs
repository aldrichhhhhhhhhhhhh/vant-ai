#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("fs");
const { join } = require("path");
const root = join(__dirname, "..");
const partsDir = join(root, "src", "ux-parts");
let b64 = "";
for (let i = 0; i < 5; i++) {
  b64 += readFileSync(join(partsDir, "app_b64_" + i + ".txt"), "utf8").trim();
}
const buf = Buffer.from(b64, "base64");
writeFileSync(join(root, "src", "VantApp.jsx"), buf);
writeFileSync(join(root, "src", "App.jsx"), 'export { default } from "./VantApp.jsx";\n');
console.log("Wrote src/VantApp.jsx (" + buf.length + " bytes) and updated App.jsx");
