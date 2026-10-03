import { useEffect, useState } from "react";

/**
 * Bootstrap entry. After clone run:
 *   node scripts/restore-app.cjs
 * which writes src/VantApp.jsx (full Claude/ChatGPT/Grok UX).
 */
export default function VantBootstrap() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#07090f",
        color: "#f0f0f8",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 560, textAlign: "center", lineHeight: 1.5 }}>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>VANT</h1>
        <p style={{ color: "#8b8fa8", marginBottom: 16 }}>
          Full UX build is packaged in this repo. From the project root run:
        </p>
        <pre
          style={{
            textAlign: "left",
            background: "#0e1117",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12,
            padding: 16,
            color: "#a78bfa",
            overflow: "auto",
          }}
        >
{`node scripts/restore-app.cjs
npm install
npm run dev`}
        </pre>
        <p style={{ color: "#5b5f74", fontSize: 13, marginTop: 16 }}>
          That reconstructs <code>src/VantApp.jsx</code> (Claude × ChatGPT × Grok UX) and wires{" "}
          <code>App.jsx</code> to it.
        </p>
      </div>
    </div>
  );
}
