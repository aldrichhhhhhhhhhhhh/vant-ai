#!/usr/bin/env node
const { readFileSync, writeFileSync, existsSync } = require("fs");
const { join } = require("path");
const https = require("https");

const root = join(__dirname, "..");
const targetPath = join(root, "src", "App.jsx");

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return get(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error("HTTP " + res.statusCode + " for " + url));
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject);
  });
}

(async () => {
  let current = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
  // If App.jsx was corrupted (tiny) or missing StudyResourceTool, restore from known commit
  const needsRestore = current.length < 10000 || !current.includes("function StudyResourceTool");
  if (needsRestore) {
    console.log("VANT restore: fetching known-good App.jsx from commit 12d3397...");
    current = await get(
      "https://raw.githubusercontent.com/aldrichhhhhhhhhhhhh/vant-ai/12d3397656c85644e5c5374976e6800d6ca37446/src/App.jsx"
    );
  }

  const old = `        </section>}
        </div>
        <p style={{ fontSize: 12, color: theme.textFaint, lineHeight: 1.6, marginTop: 16 }}>Review generated material against your class notes, source details, and teacher's instructions.</p>`;
  const neu = `        </section>}
        </div>
        </div>
        <p style={{ fontSize: 12, color: theme.textFaint, lineHeight: 1.6, marginTop: 16 }}>Review generated material against your class notes, source details, and teacher's instructions.</p>`;

  if (current.includes(old)) {
    current = current.replace(old, neu);
    console.log("VANT restore: applied workspace closing </div> fix.");
  } else if (current.includes(neu)) {
    console.log("VANT restore: workspace fix already present.");
  } else {
    console.log("VANT restore: pattern not found; leaving App.jsx as-is (" + current.length + " bytes).");
  }

  writeFileSync(targetPath, current);
  console.log("VANT restore: src/App.jsx ready (" + Buffer.byteLength(current) + " bytes).");
})().catch((err) => {
  console.error("VANT restore failed:", err);
  process.exit(1);
});
