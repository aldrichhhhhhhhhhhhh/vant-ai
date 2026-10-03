import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { supabase } from "./supabase";
import {
  buildVantWorkEnvelope,
  buildVantSystemPrompt,
} from "./vantEngine";

// Temporary bootstrap: full UX App.jsx is in the release zip / local artifacts.
// This prevents a broken production build while the large file is applied.
export default function VantBootstrap() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#07090f", color: "#f0f0f8", fontFamily: "DM Sans, system-ui, sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 600, marginBottom: 12 }}>VANT</div>
        <p style={{ color: "#8b8fa8", lineHeight: 1.5, marginBottom: 16 }}>
          The UX-upgraded <code>src/App.jsx</code> is ready in <strong>vant-ai-main-ready.zip</strong>.
          Replace this bootstrap file with the App.jsx from that zip (or pull the completed commit).
        </p>
        <p style={{ color: "#5b5f74", fontSize: 13 }}>Repo: aldrichhhhhhhhhhhhh/vant-ai</p>
      </div>
    </div>
  );
}
