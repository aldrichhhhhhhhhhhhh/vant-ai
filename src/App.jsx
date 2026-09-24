import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { supabase } from "./supabase";
import { MessageSquare, LayoutDashboard, Briefcase, Plug, Wrench, Send, Plus, Trash2, Pencil, Check, X, ArrowLeft, Calculator, FileSpreadsheet, Sun, Moon, Sparkles, History, LogIn, Settings } from "lucide-react";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap');
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
@keyframes vpulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes vfade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
.v-pulse { animation: vpulse 1.4s ease-in-out infinite; }
.v-fade { animation: vfade 0.3s ease forwards; }
`;

// ---------------------------------------------------------------------------
// Theme system
// ---------------------------------------------------------------------------
const THEMES = {
  dark: {
    bg: "#07090f", sidebarBg: "#0a0c12", surface: "rgba(255,255,255,0.04)", surfaceStrong: "rgba(255,255,255,0.08)",
    surfaceCard: "#0e1117", border: "rgba(255,255,255,0.08)", borderStrong: "rgba(255,255,255,0.15)",
    text: "#f0f0f8", textMuted: "#8b8fa8", textFaint: "#5b5f74", inputBg: "rgba(255,255,255,0.05)",
  },
  light: {
    bg: "#f5f5fa", sidebarBg: "#ffffff", surface: "rgba(15,15,35,0.045)", surfaceStrong: "rgba(15,15,35,0.08)",
    surfaceCard: "#ffffff", border: "rgba(15,15,35,0.10)", borderStrong: "rgba(15,15,35,0.2)",
    text: "#15151f", textMuted: "#5a5f72", textFaint: "#8a8fa0", inputBg: "rgba(15,15,35,0.04)",
  },
};

const ACCENTS = {
  violet: { dark: "#a78bfa", light: "#7c3aed", bg: "rgba(124,58,237,0.16)" },
  cyan: { dark: "#67e8f9", light: "#0e7490", bg: "rgba(6,182,212,0.14)" },
  green: { dark: "#6ee7b7", light: "#047857", bg: "rgba(5,150,105,0.14)" },
  amber: { dark: "#fcd34d", light: "#b45309", bg: "rgba(217,119,6,0.14)" },
  red: { dark: "#fca5a5", light: "#dc2626", bg: "rgba(220,38,38,0.12)" },
};
const ac = (key, isDark) => (isDark ? ACCENTS[key].dark : ACCENTS[key].light);
const acBg = (key) => ACCENTS[key].bg;

const NAV = [
  { id: "chat", label: "AI Chat", icon: MessageSquare, accentKey: "violet" },
  { id: "tools", label: "Tools", icon: Wrench, accentKey: "red" },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, accentKey: "cyan" },
  { id: "cowork", label: "Cowork", icon: Briefcase, accentKey: "green" },
  { id: "integrations", label: "Integrations", icon: Plug, accentKey: "amber" },
];

const INTEGRATIONS = [
  { name: "Google Drive", icon: "G", color: "#4285F4" }, { name: "Gmail", icon: "M", color: "#EA4335" },
  { name: "Calendar", icon: "C", color: "#34A853" }, { name: "Sheets", icon: "S", color: "#34A853" },
  { name: "OneDrive", icon: "O", color: "#0078D4" }, { name: "Excel", icon: "X", color: "#217346" },
  { name: "Outlook", icon: "O", color: "#0078D4" }, { name: "Teams", icon: "T", color: "#5558AF" },
  { name: "Slack", icon: "S", color: "#E01E5A" }, { name: "Notion", icon: "N", color: "#71717a" },
  { name: "Salesforce", icon: "S", color: "#00A1E0" }, { name: "HubSpot", icon: "H", color: "#FF7A59" },
];

async function askClaude(systemPrompt, messages, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let accessCode = "";
  try { accessCode = localStorage.getItem("vant_access_code") || ""; } catch { /* no storage access */ }
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-code": accessCode },
      body: JSON.stringify({ system: systemPrompt, messages }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await response.json();
    if (!response.ok) {
      if (data?.error === "access_not_configured") return "This deployment hasn't set an access code yet \u2014 set APP_ACCESS_CODE in your environment variables.";
      if (data?.error === "invalid_access_code") return "AI access is not authorized. Contact the deployment administrator.";
      if (data?.error === "payload_too_large") return "That request was too large \u2014 try a shorter message or a smaller file.";
      return data?.error === "missing_api_key"
        ? "The server isn't configured with an NVIDIA API key yet — set NVIDIA_API_KEY in your deployment's environment variables."
        : data?.detail
          ? `NVIDIA NIM error: ${data.detail}`
          : "The server had trouble reaching the model. Try again in a moment.";
    }
    const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).filter(Boolean).join("\n");
    return text || "I couldn't generate a response — try rephrasing.";
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === "AbortError") return "No response after 20 seconds — check your deployment's function logs.";
    return "Something went wrong reaching the server. Try again in a moment.";
  }
}

function Sidebar({ active, onSelect, theme, isDark, onToggleTheme }) {
  return (
    <div style={{ width: 84, flexShrink: 0, background: theme.sidebarBg, borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0", gap: 8 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(124,58,237,0.25)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
        <span style={{ color: "#c4b5fd", fontFamily: "JetBrains Mono, monospace", fontWeight: 600, fontSize: 16 }}>V</span>
      </div>
      {NAV.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button key={item.id} onClick={() => onSelect(item.id)} style={{ width: 64, padding: "8px 4px", borderRadius: 12, border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, background: isActive ? acBg(item.accentKey) : "transparent" }}>
            <Icon size={18} color={isActive ? ac(item.accentKey, isDark) : theme.textFaint} strokeWidth={1.8} />
            <span style={{ fontSize: 9.5, color: isActive ? ac(item.accentKey, isDark) : theme.textFaint, textAlign: "center", lineHeight: 1.2 }}>{item.label}</span>
          </button>
        );
      })}
      <button
        onClick={onToggleTheme}
        title={isDark ? "Switch to Day theme" : "Switch to Dark theme"}
        style={{ marginTop: "auto", width: 44, height: 44, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        {isDark ? <Sun size={17} color={theme.textMuted} /> : <Moon size={17} color={theme.textMuted} />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Chat
// ---------------------------------------------------------------------------
function ChatPage({ theme, isDark }) {
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, loading]);

  async function send(text) {
    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setStarted(true);
    setInput("");
    setLoading(true);
    const reply = await askClaude(
      "You are VANT, an AI work assistant. Be direct, concise, and genuinely useful — like a sharp colleague, not a customer service bot. Use plain formatting suited to a chat bubble, not long markdown documents.",
      next.map((m) => ({ role: m.role, content: m.content }))
    );
    setLoading(false);
    setMessages((m) => [...m, { role: "assistant", content: reply }]);
  }

  function handleSubmit(e) { e.preventDefault(); const text = input.trim(); if (!text || loading) return; send(text); }
  const suggestions = ["Draft a follow-up email to a vendor", "Summarize a wall of text I paste in", "Help me think through a decision"];
  const inputStyle = { padding: "12px 18px", borderRadius: 999, background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text, fontSize: 14.5, outline: "none" };

  if (!started) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, letterSpacing: 1.5, color: theme.textFaint, marginBottom: 14 }}>AI CHAT · LIVE</p>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 32, fontWeight: 500, margin: "0 0 8px", color: theme.text }}>What should we work on?</h1>
        <p style={{ color: theme.textMuted, fontSize: 16, margin: "0 0 28px" }}>Vant Ai - Created by Karl Aldrich Uy</p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, maxWidth: 480 }}>
          {suggestions.map((s) => <button key={s} onClick={() => send(s)} style={{ padding: "9px 18px", borderRadius: 999, background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text, fontSize: 14, cursor: "pointer" }}>{s}</button>)}
        </div>
        <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 620, marginTop: 40 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything, or tell me what you need done…" style={{ ...inputStyle, width: "100%", padding: "14px 20px", fontSize: 15, boxSizing: "border-box" }} />
        </form>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "18px 24px", borderBottom: `1px solid ${theme.border}` }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: theme.text }}>VANT · AI Chat</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: ac("green", isDark), fontSize: 13 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: ac("green", isDark) }} />Live</span>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} className="v-fade" style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "75%", padding: "12px 16px", borderRadius: 14, fontSize: 14.5, lineHeight: 1.55, whiteSpace: "pre-wrap", background: m.role === "user" ? theme.surfaceStrong : acBg("violet"), color: m.role === "user" ? theme.text : (isDark ? "#e9e0ff" : "#3b1f6b") }}>{m.content}</div>
          </div>
        ))}
        {loading && <div style={{ display: "flex", justifyContent: "flex-start" }}><div style={{ padding: "12px 16px", borderRadius: 14, background: acBg("violet"), display: "flex", gap: 4 }}>{[0, 1, 2].map((i) => <span key={i} className="v-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: ac("violet", isDark), animationDelay: `${i * 0.15}s` }} />)}</div></div>}
      </div>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, padding: 18, borderTop: `1px solid ${theme.border}` }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything…" disabled={loading} style={{ ...inputStyle, flex: 1 }} />
        <button type="submit" disabled={loading || !input.trim()} style={{ width: 44, height: 44, borderRadius: 999, background: acBg("violet"), border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: loading || !input.trim() ? 0.5 : 1 }}><Send size={17} color={ac("violet", isDark)} /></button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tools hub + individual tools
// ---------------------------------------------------------------------------
function ToolCard({ icon: Icon, accentKey, isDark, theme, title, desc, onClick }) {
  return (
    <button onClick={onClick} style={{ textAlign: "left", padding: 20, borderRadius: 16, background: theme.surface, border: `1px solid ${theme.border}`, cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: acBg(accentKey), display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={19} color={ac(accentKey, isDark)} />
      </div>
      <p style={{ fontSize: 15.5, fontWeight: 500, color: theme.text, margin: 0 }}>{title}</p>
      <p style={{ fontSize: 13, color: theme.textMuted, margin: 0, lineHeight: 1.5 }}>{desc}</p>
    </button>
  );
}

function BackBar({ title, accentKey, isDark, theme, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: theme.textMuted, fontSize: 13.5, cursor: "pointer", padding: "6px 10px 6px 0" }}>
        <ArrowLeft size={15} /> Tools
      </button>
      <span style={{ color: theme.textFaint }}>/</span>
      <span style={{ fontSize: 13.5, color: ac(accentKey, isDark) }}>{title}</span>
    </div>
  );
}

const OPS_SYSTEM_PROMPT = `You are VANT's Ops Assistant, built for people running logistics, supply chain, and day-to-day operations.
You've been given a dataset and a question. Answer directly using real numbers from the data. Proactively flag risks or anomalies (delays, shortages, cost spikes, missed deadlines) even if not asked. Be concise — lead with the answer. If the data can't answer the question, say so. Never invent numbers not in the data.`;

function OpsAssistantTool({ onBack, theme, isDark }) {
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [rawCsv, setRawCsv] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setMessages([]);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        if (!results.data.length) { setError("That file parsed but had no rows."); return; }
        setFileName(file.name);
        setHeaders(results.meta.fields || Object.keys(results.data[0]));
        setRows(results.data);
        setRawCsv(Papa.unparse(results.data));
      },
      error: (err) => setError("Couldn't read that file: " + err.message),
    });
  }

  async function handleSend(e) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading || !rawCsv) return;
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput(""); setLoading(true);
    const csvForModel = rawCsv.length > 12000 ? rawCsv.slice(0, 12000) : rawCsv;
    const reply = await askClaude(OPS_SYSTEM_PROMPT, [{ role: "user", content: `Dataset (from "${fileName}", ${rows.length} rows):\n\n${csvForModel}\n\nQuestion: ${question}` }]);
    setLoading(false);
    setMessages((m) => [...m, { role: "assistant", content: reply }]);
  }

  const suggestions = ["What's the biggest risk in this data right now?", "Which items are behind schedule?", "Summarize this in 3 bullet points."];
  const successColor = ac("green", isDark);

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <BackBar title="Ops Assistant" accentKey="red" isDark={isDark} theme={theme} onBack={onBack} />
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 500, margin: "0 0 6px", color: theme.text }}>Upload real operational data.</h1>
      <p style={{ color: theme.textMuted, fontSize: 14.5, margin: "0 0 20px" }}>A shipment log, inventory sheet, delivery schedule — then ask it directly.</p>

      <div onClick={() => fileInputRef.current?.click()} style={{ border: `1.5px dashed ${fileName ? successColor : theme.borderStrong}`, borderRadius: 14, padding: "18px 20px", textAlign: "center", cursor: "pointer", background: fileName ? acBg("green") : theme.surface, marginBottom: 16 }}>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
        {fileName ? <p style={{ color: successColor, fontSize: 14, margin: 0 }}>✓ {fileName} — {rows.length} rows · click to replace</p> : <p style={{ color: theme.text, fontSize: 14, margin: 0 }}>Click to upload a .csv file</p>}
      </div>
      {error && <p style={{ color: ac("red", isDark), fontSize: 13, marginBottom: 14 }}>{error}</p>}

      {rows.length > 0 && (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: theme.surface }}>{headers.map((h) => <th key={h} style={{ textAlign: "left", padding: "9px 12px", color: theme.textMuted, fontFamily: "JetBrains Mono, monospace", fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{rows.slice(0, 3).map((row, i) => <tr key={i} style={{ borderTop: `1px solid ${theme.border}` }}>{headers.map((h) => <td key={h} style={{ padding: "9px 12px", color: theme.text, whiteSpace: "nowrap" }}>{String(row[h] ?? "")}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {rows.length > 3 && <div style={{ padding: "6px 12px", color: theme.textFaint, fontSize: 11.5, fontFamily: "JetBrains Mono, monospace", borderTop: `1px solid ${theme.border}` }}>+ {rows.length - 3} more rows</div>}
        </div>
      )}

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.surfaceCard, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, maxHeight: 300, overflowY: "auto" }}>
          {messages.length === 0 && (
            <div>
              <p style={{ color: theme.textFaint, fontSize: 13, marginBottom: 8 }}>{rawCsv ? "Try asking:" : "Upload a file above first."}</p>
              {rawCsv && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{suggestions.map((s) => <button key={s} onClick={() => setInput(s)} style={{ padding: "7px 12px", borderRadius: 999, background: theme.surface, border: `1px solid ${theme.border}`, color: theme.textMuted, fontSize: 12.5, cursor: "pointer" }}>{s}</button>)}</div>}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className="v-fade" style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{ maxWidth: "85%", padding: "10px 14px", borderRadius: 12, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap", background: m.role === "user" ? theme.surfaceStrong : acBg("red"), color: m.role === "user" ? theme.text : (isDark ? "#fecaca" : "#7f1d1d") }}>{m.content}</div>
            </div>
          ))}
          {loading && <p style={{ color: ac("red", isDark), fontSize: 12.5, fontFamily: "JetBrains Mono, monospace" }}>Analyzing…</p>}
        </div>
        <form onSubmit={handleSend} style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${theme.border}` }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={rawCsv ? "Ask anything about this data…" : "Upload a file first…"} disabled={!rawCsv || loading}
            style={{ flex: 1, padding: "9px 14px", borderRadius: 999, background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text, fontSize: 13.5, outline: "none" }} />
          <button type="submit" disabled={!rawCsv || loading || !input.trim()} style={{ padding: "9px 18px", borderRadius: 999, background: "#fff", color: "#07090f", fontWeight: 500, fontSize: 13.5, border: "none", cursor: "pointer", opacity: !rawCsv || loading || !input.trim() ? 0.5 : 1 }}>Ask</button>
        </form>
      </div>
    </div>
  );
}

const DIVISORS = [
  { label: "Air — 5000 (cm³/kg)", value: 5000 },
  { label: "Air — 6000 (cm³/kg)", value: 6000 },
  { label: "Courier — 4000 (cm³/kg)", value: 4000 },
  { label: "Custom", value: "custom" },
];

function ChargeableWeightTool({ onBack, theme, isDark }) {
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [pieces, setPieces] = useState("1");
  const [actualWeight, setActualWeight] = useState("");
  const [divisorChoice, setDivisorChoice] = useState(5000);
  const [customDivisor, setCustomDivisor] = useState("5000");

  const divisor = divisorChoice === "custom" ? parseFloat(customDivisor) || 0 : divisorChoice;
  const L = parseFloat(length) || 0, W = parseFloat(width) || 0, H = parseFloat(height) || 0, P = parseFloat(pieces) || 0, AW = parseFloat(actualWeight) || 0;
  const volumetricWeight = divisor > 0 ? (L * W * H * P) / divisor : 0;
  const totalActual = AW * P;
  const chargeable = Math.max(totalActual, volumetricWeight);
  const hasInputs = L > 0 && W > 0 && H > 0 && AW > 0;
  const amber = ac("amber", isDark);

  const fieldStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, background: theme.inputBg, border: `1px solid ${theme.borderStrong}`, color: theme.text, fontSize: 14.5, outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 12.5, color: theme.textMuted, marginBottom: 6, display: "block" };

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <BackBar title="Chargeable Weight Calculator" accentKey="amber" isDark={isDark} theme={theme} onBack={onBack} />
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 500, margin: "0 0 6px", color: theme.text }}>Actual vs. volumetric weight.</h1>
      <p style={{ color: theme.textMuted, fontSize: 14.5, margin: "0 0 24px" }}>Chargeable weight is whichever is higher — this is standard freight billing math.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div><label style={labelStyle}>Length (cm)</label><input value={length} onChange={(e) => setLength(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="0" /></div>
        <div><label style={labelStyle}>Width (cm)</label><input value={width} onChange={(e) => setWidth(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="0" /></div>
        <div><label style={labelStyle}>Height (cm)</label><input value={height} onChange={(e) => setHeight(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="0" /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div><label style={labelStyle}>Pieces</label><input value={pieces} onChange={(e) => setPieces(e.target.value)} type="number" min="1" style={fieldStyle} /></div>
        <div><label style={labelStyle}>Actual weight per piece (kg)</label><input value={actualWeight} onChange={(e) => setActualWeight(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="0" /></div>
      </div>
      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Volumetric divisor</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DIVISORS.map((d) => (
            <button key={d.label} onClick={() => setDivisorChoice(d.value)}
              style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer", border: `1px solid ${divisorChoice === d.value ? amber : theme.borderStrong}`, background: divisorChoice === d.value ? acBg("amber") : theme.surface, color: divisorChoice === d.value ? amber : theme.textMuted }}>
              {d.label}
            </button>
          ))}
          {divisorChoice === "custom" && <input value={customDivisor} onChange={(e) => setCustomDivisor(e.target.value)} type="number" min="1" style={{ ...fieldStyle, width: 120 }} />}
        </div>
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.surfaceCard, padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: hasInputs ? 18 : 0 }}>
          <div><p style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 4px" }}>Total actual weight</p><p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: theme.text }}>{totalActual.toFixed(2)} kg</p></div>
          <div><p style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 4px" }}>Volumetric weight</p><p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: theme.text }}>{volumetricWeight.toFixed(2)} kg</p></div>
        </div>
        {hasInputs && (
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ fontSize: 12, color: amber, margin: "0 0 4px", fontFamily: "JetBrains Mono, monospace", letterSpacing: 1 }}>CHARGEABLE WEIGHT</p>
              <p style={{ fontSize: 30, fontWeight: 600, margin: 0, color: amber }}>{chargeable.toFixed(2)} kg</p>
            </div>
            <p style={{ fontSize: 12.5, color: theme.textFaint, maxWidth: 200, textAlign: "right" }}>
              {volumetricWeight > totalActual ? "Billed on volume — it's bulkier than it is heavy." : "Billed on actual weight — it's heavier than it is bulky."}
            </p>
          </div>
        )}
      </div>
      <p style={{ color: theme.textFaint, fontSize: 12, marginTop: 14 }}>Formula: volumetric weight = (L × W × H × pieces) ÷ divisor. Chargeable weight = the higher of that and total actual weight.</p>
    </div>
  );
}

function ToolsPage({ theme, isDark }) {
  const [view, setView] = useState("hub");
  if (view === "ops") return <OpsAssistantTool onBack={() => setView("hub")} theme={theme} isDark={isDark} />;
  if (view === "weight") return <ChargeableWeightTool onBack={() => setView("hub")} theme={theme} isDark={isDark} />;

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, letterSpacing: 1.5, color: theme.textFaint, margin: "0 0 6px" }}>TOOLS</p>
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 500, margin: "0 0 22px", color: theme.text }}>Pick a tool.</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
        <ToolCard icon={FileSpreadsheet} accentKey="red" isDark={isDark} theme={theme} title="Ops Assistant" desc="Upload a shipment log, inventory sheet, or delivery schedule and ask real questions about it." onClick={() => setView("ops")} />
        <ToolCard icon={Calculator} accentKey="amber" isDark={isDark} theme={theme} title="Chargeable Weight Calculator" desc="Compare actual vs. volumetric weight to get the real billable freight weight." onClick={() => setView("weight")} />
      </div>
      <p style={{ color: theme.textFaint, fontSize: 12.5, marginTop: 20 }}>More tools land here as we build them — this hub is built to grow.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard (illustrative)
// ---------------------------------------------------------------------------
function CountUp({ to, duration = 900 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf; const start = performance.now();
    function tick(now) { const p = Math.min(1, (now - start) / duration); setVal(Math.round(p * to)); if (p < 1) raf = requestAnimationFrame(tick); }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <>{val}</>;
}

const MOCK_EMAILS = [
  { from: "logistics@vendor-freightco.com", subject: "Delay notice — shipment #4471", snippet: "Customs hold expected to clear by Thursday...", time: "22m ago" },
  { from: "ops@warehouse-north.com", subject: "Weekly inventory reconciliation", snippet: "3 SKUs show variance against last count...", time: "1h ago" },
  { from: "accounts@carrier-express.com", subject: "Invoice #88213 overdue", snippet: "Payment was due on the 12th, please advise...", time: "3h ago" },
  { from: "hr@company.com", subject: "Reminder: Q3 review forms due Friday", snippet: "Please submit your self-assessment by end of week...", time: "5h ago" },
];
const MOCK_MEETINGS = [
  { title: "Ops sync — weekly review", time: "Today, 3:00 PM", withWho: "5 attendees", type: "Google Meet" },
  { title: "Vendor call: FreightCo delay", time: "Today, 4:30 PM", withWho: "2 attendees", type: "Google Meet" },
  { title: "Warehouse walkthrough", time: "Tomorrow, 9:00 AM", withWho: "In-person", type: "Calendar" },
  { title: "Monthly ops report review", time: "Fri, 11:00 AM", withWho: "3 attendees", type: "Google Meet" },
];
const MOCK_AI_ACTIVITY = [
  { kind: "Chat", desc: "Summarized Q3 operations report", when: "2h ago" },
  { kind: "Ops Assistant", desc: "Flagged 2 shipments behind schedule from uploaded log", when: "4h ago" },
  { kind: "Chat", desc: "Drafted follow-up email to FreightCo", when: "Yesterday" },
  { kind: "Tools", desc: "Calculated chargeable weight for 3 shipments", when: "Yesterday" },
];

function DashboardPage({ theme, isDark, connected, coworkTasks = [], onGoToIntegrations }) {
  const bars = [65, 82, 71, 90, 68, 85, 78];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const [grown, setGrown] = useState(false);
  const [openPanel, setOpenPanel] = useState(null);
  useEffect(() => { const t = setTimeout(() => setGrown(true), 80); return () => clearTimeout(t); }, []);

  const upColor = ac("green", isDark), downColor = ac("red", isDark);
  const pendingTasks = coworkTasks.filter((t) => t.status !== "done");
  const priorityRank = { high: 0, moderate: 1, light: 2 };
  const sortedPending = [...pendingTasks].sort((a, b) => (priorityRank[a.priority || "moderate"] - priorityRank[b.priority || "moderate"]));
  const priorityColor = { high: ac("red", isDark), moderate: ac("amber", isDark), light: theme.textMuted };

  const kpis = [
    { key: "emails", label: "EMAILS", value: MOCK_EMAILS.length, change: "+3", up: true, live: false },
    { key: "tasks", label: "TASKS", value: pendingTasks.length, change: `${pendingTasks.length} pending`, up: true, live: true },
    { key: "meetings", label: "MEETINGS", value: MOCK_MEETINGS.length, change: "+1", up: true, live: false },
    { key: "aiActivity", label: "AI ACTIVITY", value: MOCK_AI_ACTIVITY.length, change: "+8", up: true, live: false },
  ];

  function togglePanel(key) { setOpenPanel((p) => (p === key ? null : key)); }
  const panelStyle = { background: theme.surfaceCard, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 18, marginBottom: 20 };
  const noteStyle = { color: theme.textFaint, fontSize: 11.5, marginTop: 12, fontStyle: "italic" };

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, letterSpacing: 1.5, color: theme.textFaint, margin: "0 0 6px" }}>DASHBOARD</p>
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 500, margin: "0 0 4px", color: theme.text }}>Here's what needs your attention</h1>
      <p style={{ color: theme.textMuted, fontSize: 15, margin: "0 0 26px" }}>Click a tile for details.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: openPanel ? 16 : 20 }}>
        {kpis.map((k) => (
          <button key={k.key} onClick={() => togglePanel(k.key)} style={{ textAlign: "left", background: openPanel === k.key ? theme.surfaceStrong : theme.surface, border: `1px solid ${openPanel === k.key ? theme.borderStrong : "transparent"}`, borderRadius: 14, padding: 16, cursor: "pointer" }}>
            <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1, color: theme.textMuted, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
              {k.label}{k.live && <span style={{ width: 5, height: 5, borderRadius: 999, background: ac("green", isDark) }} title="Live data" />}
            </p>
            <p style={{ fontSize: 28, fontWeight: 600, margin: 0, color: theme.text }}><CountUp to={k.value} /></p>
            <p style={{ fontSize: 12, margin: "4px 0 0", color: k.up ? upColor : downColor }}>{k.change}</p>
          </button>
        ))}
      </div>

      {openPanel === "emails" && (
        <div style={panelStyle}>
          {connected.has("Gmail") ? (
            <>
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1, color: theme.textMuted, margin: "0 0 14px" }}>RECENT EMAILS</p>
              {MOCK_EMAILS.map((e, i) => (
                <div key={i} style={{ padding: "10px 0", borderTop: i > 0 ? `1px solid ${theme.border}` : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 13.5, color: theme.text, fontWeight: 500 }}>{e.subject}</span>
                    <span style={{ fontSize: 11.5, color: theme.textFaint }}>{e.time}</span>
                  </div>
                  <p style={{ fontSize: 12.5, color: theme.textMuted, margin: "0 0 2px" }}>{e.from}</p>
                  <p style={{ fontSize: 12.5, color: theme.textFaint, margin: 0 }}>{e.snippet}</p>
                </div>
              ))}
              <p style={noteStyle}>Illustrative sample — will show your real inbox once Gmail's OAuth is fully wired up.</p>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <p style={{ color: theme.textMuted, fontSize: 13.5, margin: "0 0 12px" }}>Gmail isn't connected.</p>
              <button onClick={onGoToIntegrations} style={{ padding: "8px 16px", borderRadius: 999, background: acBg("amber"), border: "none", color: ac("amber", isDark), fontSize: 13, cursor: "pointer" }}>Connect in Integrations</button>
            </div>
          )}
        </div>
      )}

      {openPanel === "tasks" && (
        <div style={panelStyle}>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1, color: theme.textMuted, margin: "0 0 14px" }}>PENDING TASKS · BY PRIORITY</p>
          {sortedPending.length === 0 && <p style={{ color: theme.textFaint, fontSize: 13.5 }}>No pending tasks — add some in Cowork.</p>}
          {sortedPending.map((t, i) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i > 0 ? `1px solid ${theme.border}` : "none" }}>
              <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: priorityColor[t.priority || "moderate"], minWidth: 62 }}>{(t.priority || "moderate").toUpperCase()}</span>
              <span style={{ flex: 1, fontSize: 13.5, color: theme.text }}>{t.name}</span>
              <span style={{ fontSize: 11.5, color: theme.textFaint }}>{t.status}</span>
            </div>
          ))}
          <p style={noteStyle}>Live from Cowork — this is your real task list, not mock data.</p>
        </div>
      )}

      {openPanel === "meetings" && (
        <div style={panelStyle}>
          {connected.has("Calendar") ? (
            <>
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1, color: theme.textMuted, margin: "0 0 14px" }}>UPCOMING MEETINGS</p>
              {MOCK_MEETINGS.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: i > 0 ? `1px solid ${theme.border}` : "none" }}>
                  <div>
                    <p style={{ fontSize: 13.5, color: theme.text, margin: "0 0 2px" }}>{m.title}</p>
                    <p style={{ fontSize: 12, color: theme.textFaint, margin: 0 }}>{m.withWho} · {m.type}</p>
                  </div>
                  <span style={{ fontSize: 12, color: theme.textMuted }}>{m.time}</span>
                </div>
              ))}
              <p style={noteStyle}>Illustrative sample — will sync with your real Calendar once its OAuth is fully wired up.</p>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "12px 0" }}>
              <p style={{ color: theme.textMuted, fontSize: 13.5, margin: "0 0 12px" }}>Calendar isn't connected.</p>
              <button onClick={onGoToIntegrations} style={{ padding: "8px 16px", borderRadius: 999, background: acBg("amber"), border: "none", color: ac("amber", isDark), fontSize: 13, cursor: "pointer" }}>Connect in Integrations</button>
            </div>
          )}
        </div>
      )}

      {openPanel === "aiActivity" && (
        <div style={panelStyle}>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1, color: theme.textMuted, margin: "0 0 14px" }}>WHAT VANT DID</p>
          {MOCK_AI_ACTIVITY.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i > 0 ? `1px solid ${theme.border}` : "none" }}>
              <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: ac("violet", isDark), minWidth: 90 }}>{a.kind.toUpperCase()}</span>
              <span style={{ flex: 1, fontSize: 13.5, color: theme.text }}>{a.desc}</span>
              <span style={{ fontSize: 11.5, color: theme.textFaint }}>{a.when}</span>
            </div>
          ))}
          <p style={noteStyle}>Illustrative — will reflect real Chat &amp; Cowork activity once that logging is wired up.</p>
        </div>
      )}

      <div style={{ background: theme.surface, borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1, color: theme.textMuted, margin: "0 0 16px" }}>PRODUCTIVITY · SEPT</p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 110 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ width: "100%", borderRadius: 4, height: grown ? `${h}%` : "0%", background: i === 5 ? acBg("violet") : theme.surfaceStrong, transition: `height 0.7s ease ${i * 0.05}s` }} />
              <span style={{ fontSize: 11, color: theme.textFaint }}>{days[i]}</span>
            </div>
          ))}
        </div>
        <p style={noteStyle}>Illustrative — will record real daily activity once connected.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cowork
// ---------------------------------------------------------------------------
const STATUS_ORDER = ["queued", "running", "done"];
const PRIORITY_ORDER = ["light", "moderate", "high"];

const COWORK_PLANNER_PROMPT = `You are VANT Cowork's planner. Given a goal from an operations/logistics manager, break it into 3 to 5 concrete, concise subtasks needed to accomplish it. Respond with ONLY the subtasks, one per line, each starting with "- ". No preamble, no explanation, no extra numbering.`;
const COWORK_DELIVERY_PROMPT = `You are VANT Cowork reporting back after completing a delegated goal for a busy operations manager. Given the goal and the subtasks that were completed, write a concise 2 to 3 sentence summary of the finished result — concrete and specific, as if handing back real, finished work.`;

function parsePlanSteps(text) {
  const lines = text.split("\n").map((l) => l.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  return lines.length ? lines : [text.trim()].filter(Boolean);
}
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const COWORK_SUGGESTIONS = [
  "Draft the weekly ops summary for leadership",
  "Follow up with vendors who are behind schedule",
  "Organize this month's shipment invoices",
];

function CoworkPage({ theme, isDark, initialTasks = [], initialHistory = [], stateReady = false, onPersist }) {
  const [view, setView] = useState("active");
  const [tasks, setTasks] = useState(initialTasks);
  const [history, setHistory] = useState(initialHistory);
  const hydratedRef = useRef(false);
  const [goalInput, setGoalInput] = useState("");
  const [planning, setPlanning] = useState(false);
  const [activeGoalText, setActiveGoalText] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (!stateReady) return;
    setTasks(Array.isArray(initialTasks) ? initialTasks : []);
    setHistory(Array.isArray(initialHistory) ? initialHistory : []);
    hydratedRef.current = true;
  }, [stateReady]);

  useEffect(() => {
    if (!stateReady || !hydratedRef.current) return;
    onPersist?.({ cowork_tasks: tasks });
  }, [tasks, stateReady]);

  useEffect(() => {
    if (!stateReady || !hydratedRef.current) return;
    onPersist?.({ cowork_history: history });
  }, [history, stateReady]);

  function addTask(e) { e.preventDefault(); const name = newTask.trim(); if (!name) return; setTasks((t) => [...t, { id: Date.now(), name, status: "queued", priority: "moderate", goalId: null, goalText: null, createdAt: new Date().toISOString() }]); setNewTask(""); }
  function cycleStatus(id) { setTasks((t) => t.map((task) => { if (task.id !== id) return task; const idx = STATUS_ORDER.indexOf(task.status); return { ...task, status: STATUS_ORDER[(idx + 1) % STATUS_ORDER.length] }; })); }
  function cyclePriority(id) { setTasks((t) => t.map((task) => { if (task.id !== id) return task; const idx = PRIORITY_ORDER.indexOf(task.priority || "moderate"); return { ...task, priority: PRIORITY_ORDER[(idx + 1) % PRIORITY_ORDER.length] }; })); }
  function startEdit(task) { setEditingId(task.id); setEditValue(task.name); }
  function saveEdit(id) { const trimmed = editValue.trim(); if (trimmed) setTasks((t) => t.map((task) => (task.id === id ? { ...task, name: trimmed } : task))); setEditingId(null); }
  function deleteTask(id) { setTasks((t) => t.filter((task) => task.id !== id)); }

  async function runGoal(goalId, goal, stepTasks) {
    for (const step of stepTasks) {
      setTasks((t) => t.map((x) => (x.id === step.id ? { ...x, status: "running" } : x)));
      await delay(1100 + Math.random() * 500);
      setTasks((t) => t.map((x) => (x.id === step.id ? { ...x, status: "done" } : x)));
      await delay(300);
    }
    const summary = await askClaude(COWORK_DELIVERY_PROMPT, [{ role: "user", content: `Goal: ${goal}\n\nCompleted subtasks:\n${stepTasks.map((s) => "- " + s.name).join("\n")}` }]);
    setHistory((h) => [{ id: goalId, goal, summary, stepCount: stepTasks.length, completedAt: new Date().toISOString() }, ...h]);
    setTasks((t) => t.filter((x) => x.goalId !== goalId));
    setActiveGoalText("");
  }

  async function submitGoal(e) {
    e.preventDefault();
    const goal = goalInput.trim();
    if (!goal || planning || activeGoalText) return;
    setPlanning(true);
    const planText = await askClaude(COWORK_PLANNER_PROMPT, [{ role: "user", content: goal }]);
    const steps = parsePlanSteps(planText);
    const goalId = Date.now();
    const stepTasks = steps.map((name, i) => ({ id: goalId + i, name, status: "queued", priority: "moderate", goalId, goalText: goal, createdAt: new Date().toISOString() }));
    setTasks((t) => [...t, ...stepTasks]);
    setGoalInput("");
    setPlanning(false);
    setActiveGoalText(goal);
    runGoal(goalId, goal, stepTasks);
  }

  const STATUS_STYLE = {
    queued: { color: theme.textFaint, dot: theme.textFaint, label: "Queued" },
    running: { color: ac("cyan", isDark), dot: ac("cyan", isDark), label: "Running" },
    done: { color: ac("green", isDark), dot: ac("green", isDark), label: "Done" },
  };
  const PRIORITY_STYLE = {
    high: { color: ac("red", isDark), label: "High" },
    moderate: { color: ac("amber", isDark), label: "Moderate" },
    light: { color: theme.textMuted, label: "Light" },
  };
  const tabBtn = (isActive) => ({ padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer", background: isActive ? theme.surfaceStrong : "transparent", color: isActive ? theme.text : theme.textFaint, display: "flex", alignItems: "center", gap: 6 });

  return (
    <div style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column" }}>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, letterSpacing: 1.5, color: theme.textFaint, margin: "0 0 6px" }}>COWORK</p>
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 500, margin: "0 0 16px", color: theme.text }}>Give VANT the work.</h1>

      <div style={{ display: "flex", gap: 4, marginBottom: 18, padding: 4, borderRadius: 999, background: theme.surface, width: "fit-content" }}>
        <button onClick={() => setView("active")} style={tabBtn(view === "active")}>Active</button>
        <button onClick={() => setView("history")} style={tabBtn(view === "history")}><History size={13} /> History{history.length > 0 ? ` (${history.length})` : ""}</button>
      </div>

      {view === "active" ? (
        <>
          <form onSubmit={submitGoal} style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="What do you want VANT to do?"
                disabled={planning || !!activeGoalText}
                style={{ flex: 1, padding: "12px 18px", borderRadius: 999, background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text, fontSize: 14.5, outline: "none" }} />
              <button type="submit" disabled={planning || !!activeGoalText || !goalInput.trim()}
                style={{ padding: "0 20px", borderRadius: 999, background: acBg("green"), border: "none", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", color: ac("green", isDark), fontSize: 13.5, fontWeight: 500, opacity: planning || !!activeGoalText || !goalInput.trim() ? 0.5 : 1 }}>
                <Sparkles size={15} /> {planning ? "Planning…" : "Delegate"}
              </button>
            </div>
            {!activeGoalText && !planning && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {COWORK_SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => setGoalInput(s)} style={{ padding: "7px 14px", borderRadius: 999, background: theme.surface, border: `1px solid ${theme.border}`, color: theme.textMuted, fontSize: 12.5, cursor: "pointer" }}>{s}</button>)}
              </div>
            )}
            {activeGoalText && (
              <p style={{ fontSize: 12.5, color: ac("cyan", isDark), margin: 0 }}>
                <span className="v-pulse">●</span> Working on: {activeGoalText}
              </p>
            )}
          </form>
          <p style={{ color: theme.textFaint, fontSize: 11.5, marginBottom: 18, fontStyle: "italic" }}>VANT's plan and final summary are real AI output — step execution is simulated for this prototype so you can see the flow.</p>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
            {tasks.length === 0 && <p style={{ color: theme.textFaint, fontSize: 14 }}>No active tasks — delegate a goal above, or add one manually below.</p>}
            {tasks.map((task) => {
              const s = STATUS_STYLE[task.status];
              const isEditing = editingId === task.id;
              return (
                <div key={task.id} className="v-fade" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "11px 14px", borderRadius: 12, background: theme.surface }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button onClick={() => cycleStatus(task.id)} title="Click to change status" style={{ background: "none", border: `1px solid ${theme.borderStrong}`, borderRadius: 999, padding: "4px 10px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                      <span className={task.status === "running" ? "v-pulse" : ""} style={{ width: 7, height: 7, borderRadius: 999, background: s.dot }} />
                      <span style={{ fontSize: 11.5, color: s.color, fontFamily: "JetBrains Mono, monospace" }}>{s.label}</span>
                    </button>
                    <button onClick={() => cyclePriority(task.id)} title="Click to change priority" style={{ background: "none", border: `1px solid ${theme.borderStrong}`, borderRadius: 999, padding: "4px 10px", cursor: "pointer" }}>
                      <span style={{ fontSize: 11.5, color: (PRIORITY_STYLE[task.priority || "moderate"]).color, fontFamily: "JetBrains Mono, monospace" }}>{(PRIORITY_STYLE[task.priority || "moderate"]).label}</span>
                    </button>
                    {isEditing ? (
                      <>
                        <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(task.id); if (e.key === "Escape") setEditingId(null); }}
                          style={{ flex: 1, padding: "6px 10px", borderRadius: 8, background: theme.surfaceStrong, border: `1px solid ${ac("violet", isDark)}`, color: theme.text, fontSize: 14, outline: "none" }} />
                        <button onClick={() => saveEdit(task.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><Check size={16} color={ac("green", isDark)} /></button>
                        <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={16} color={theme.textMuted} /></button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: 14.5, color: theme.text }}>{task.name}</span>
                        <button onClick={() => startEdit(task)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Pencil size={14} color={theme.textFaint} /></button>
                        <button onClick={() => deleteTask(task.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Trash2 size={14} color={theme.textFaint} /></button>
                      </>
                    )}
                  </div>
                  {task.goalText && <p style={{ fontSize: 11, color: theme.textFaint, margin: "0 0 0 4px" }}>From: "{task.goalText}"</p>}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14 }}>
            {manualOpen ? (
              <form onSubmit={addTask} style={{ display: "flex", gap: 8 }}>
                <input autoFocus value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="One-off task name…"
                  style={{ flex: 1, padding: "9px 14px", borderRadius: 999, background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text, fontSize: 13.5, outline: "none" }} />
                <button type="submit" style={{ padding: "9px 16px", borderRadius: 999, background: theme.surfaceStrong, border: "none", color: theme.text, fontSize: 13, cursor: "pointer" }}>Add</button>
                <button type="button" onClick={() => setManualOpen(false)} style={{ padding: "9px 12px", borderRadius: 999, background: "none", border: "none", color: theme.textFaint, fontSize: 13, cursor: "pointer" }}>Cancel</button>
              </form>
            ) : (
              <button onClick={() => setManualOpen(true)} style={{ background: "none", border: "none", color: theme.textFaint, fontSize: 12.5, cursor: "pointer", padding: 0 }}>+ add a one-off task manually</button>
            )}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {history.length === 0 && <p style={{ color: theme.textFaint, fontSize: 14 }}>No completed goals yet — delegate something in the Active tab.</p>}
          {history.map((h) => (
            <div key={h.id} className="v-fade" style={{ padding: 16, borderRadius: 14, background: theme.surface, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 14.5, fontWeight: 500, color: theme.text }}>{h.goal}</span>
                <span style={{ fontSize: 11.5, color: theme.textFaint }}>{new Date(h.completedAt).toLocaleString()}</span>
              </div>
              <p style={{ fontSize: 13.5, color: theme.textMuted, margin: "0 0 6px", lineHeight: 1.5 }}>{h.summary}</p>
              <p style={{ fontSize: 11, color: theme.textFaint, margin: 0 }}>{h.stepCount} steps completed</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IntegrationsPage({ theme, isDark, connected, onToggle }) {
  const onColor = ac("green", isDark);

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, letterSpacing: 1.5, color: theme.textFaint, margin: "0 0 6px" }}>INTEGRATIONS</p>
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 500, margin: "0 0 22px", color: theme.text }}>Connected to how you work.</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
        {INTEGRATIONS.map((intg) => {
          const isOn = connected.has(intg.name);
          return (
            <button key={intg.name} onClick={() => onToggle(intg.name)} style={{ textAlign: "left", padding: 16, borderRadius: 14, background: theme.surface, border: `1px solid ${theme.border}`, cursor: "pointer" }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: `${intg.color}22`, color: intg.color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{intg.icon}</div>
              <p style={{ fontSize: 13.5, color: theme.text, margin: "0 0 4px" }}>{intg.name}</p>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: isOn ? onColor : theme.textFaint }}><span style={{ width: 5, height: 5, borderRadius: 999, background: isOn ? onColor : theme.textFaint }} />{isOn ? "Connected" : "Not connected"}</span>
            </button>
          );
        })}
      </div>
      <p style={{ color: theme.textFaint, fontSize: 12, marginTop: 18 }}>Toggling here has real effects elsewhere — try disconnecting Gmail or Calendar, then check Dashboard. Actually pulling your real data still needs the OAuth setup we discussed earlier.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account, Settings, and top bar
// ---------------------------------------------------------------------------
function Overlay({ onClose, theme, children, width = 380 }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: width, background: theme.surfaceCard, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 24, position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 14, right: 14, background: "none", border: "none", cursor: "pointer", color: theme.textFaint }}><X size={16} /></button>
        {children}
      </div>
    </div>
  );
}

function TopBar({ theme, isDark, user, pageLabel, onOpenAuth, onOpenSettings }) {
  return (
    <div style={{ height: 56, flexShrink: 0, borderBottom: `1px solid ${theme.border}`, display: "flex", alignItems: "center", padding: "0 24px", gap: 12 }}>
      <span style={{ fontSize: 13, color: theme.textFaint, fontFamily: "JetBrains Mono, monospace", letterSpacing: 1 }}>{pageLabel?.toUpperCase()}</span>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        {user ? (
          <>
            <span style={{ fontSize: 13.5, color: theme.text }}>Hi, {user.name}</span>
            <button onClick={onOpenSettings} title="Settings" style={{ width: 34, height: 34, borderRadius: 999, border: `1px solid ${theme.border}`, background: theme.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Settings size={15} color={theme.textMuted} />
            </button>
          </>
        ) : (
          <button onClick={onOpenAuth} style={{ padding: "8px 16px", borderRadius: 999, background: acBg("violet"), border: "none", color: ac("violet", isDark), fontSize: 13.5, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <LogIn size={14} /> Sign up / Log in
          </button>
        )}
      </div>
    </div>
  );
}

function AuthModal({ mode, setMode, theme, isDark, onClose, onAuth }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (mode === "signup" && !name.trim()) {
      setError("Enter your name.");
      return;
    }
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);
    const result = await onAuth({
      mode,
      name: name.trim(),
      email: email.trim(),
      password,
    });
    setBusy(false);

    if (result?.error) {
      setError(result.error);
      return;
    }

    if (result?.message) {
      setMessage(result.message);
      return;
    }

    onClose();
  }

  const fieldStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, background: theme.inputBg, border: `1px solid ${theme.borderStrong}`, color: theme.text, fontSize: 14, outline: "none", marginBottom: 10, boxSizing: "border-box" };

  return (
    <Overlay onClose={onClose} theme={theme}>
      <div style={{ display: "flex", gap: 4, marginBottom: 18, padding: 4, borderRadius: 999, background: theme.surface, width: "fit-content" }}>
        <button type="button" onClick={() => { setMode("signup"); setError(""); setMessage(""); }} style={{ padding: "7px 14px", borderRadius: 999, border: "none", cursor: "pointer", background: mode === "signup" ? theme.surfaceStrong : "transparent", color: theme.text, fontSize: 13 }}>Sign up</button>
        <button type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }} style={{ padding: "7px 14px", borderRadius: 999, border: "none", cursor: "pointer", background: mode === "login" ? theme.surfaceStrong : "transparent", color: theme.text, fontSize: 13 }}>Log in</button>
      </div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 21, fontWeight: 500, margin: "0 0 14px", color: theme.text }}>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
      <form onSubmit={submit}>
        {mode === "signup" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoComplete="name" style={fieldStyle} />}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" autoComplete="email" style={fieldStyle} />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} style={fieldStyle} />
        {error && <p style={{ color: ac("red", isDark), fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.45 }}>{error}</p>}
        {message && <p style={{ color: ac("green", isDark), fontSize: 12.5, margin: "0 0 10px", lineHeight: 1.45 }}>{message}</p>}
        <button type="submit" disabled={busy} style={{ width: "100%", padding: "11px 0", borderRadius: 999, background: "#fff", color: "#07090f", fontWeight: 500, fontSize: 14, border: "none", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Please wait…" : mode === "signup" ? "Sign up" : "Log in"}</button>
      </form>
      <p style={{ color: theme.textFaint, fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>Secure account powered by Supabase Auth. Your VANT state is stored per account.</p>
    </Overlay>
  );
}

function SettingsModal({ theme, isDark, onToggleTheme, user, onClose, onLogout, onClearData, accessCode, onAccessCodeChange }) {
  return (
    <Overlay onClose={onClose} theme={theme} width={420}>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: 21, fontWeight: 500, margin: "0 0 18px", color: theme.text }}>Settings</h2>

      <div style={{ marginBottom: 22 }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1, color: theme.textFaint, margin: "0 0 10px" }}>ACCOUNT</p>
        {user ? (
          <>
            <p style={{ fontSize: 14, color: theme.text, margin: "0 0 2px" }}>{user.name}</p>
            <p style={{ fontSize: 12.5, color: theme.textMuted, margin: "0 0 10px" }}>{user.email}</p>
            <button onClick={onLogout} style={{ fontSize: 13, color: ac("red", isDark), background: "none", border: "none", cursor: "pointer", padding: 0 }}>Log out</button>
          </>
        ) : <p style={{ fontSize: 13.5, color: theme.textMuted }}>Not signed in.</p>}
      </div>

      <div style={{ marginBottom: 22 }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1, color: theme.textFaint, margin: "0 0 10px" }}>APPEARANCE</p>
        <button onClick={onToggleTheme} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 999, background: theme.surface, border: `1px solid ${theme.border}`, color: theme.text, fontSize: 13.5, cursor: "pointer" }}>
          {isDark ? <Sun size={14} /> : <Moon size={14} />} Switch to {isDark ? "Day" : "Dark"} theme
        </button>
      </div>

      <div>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1, color: theme.textFaint, margin: "0 0 10px" }}>DATA</p>
        <button onClick={onClearData} style={{ padding: "9px 16px", borderRadius: 999, background: acBg("red"), border: "none", color: ac("red", isDark), fontSize: 13.5, cursor: "pointer" }}>
          Reset my VANT data
        </button>
        <p style={{ color: theme.textFaint, fontSize: 11, marginTop: 8 }}>Resets this account's saved theme, tasks, and Cowork history.</p>
      </div>
    </Overlay>
  );
}

export default function VantWorkingPrototype() {
  const [active, setActive] = useState("chat");
  const [themeName, setThemeName] = useState("dark");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [connected, setConnected] = useState(() => new Set(INTEGRATIONS.map((i) => i.name)));
  const [accessCode, setAccessCode] = useState(() => { try { return localStorage.getItem("vant_access_code") || ""; } catch { return ""; } });
  const [appState, setAppState] = useState({ theme: "dark", cowork_tasks: [], cowork_history: [] });
  const [stateReady, setStateReady] = useState(false);
  const appStateRef = useRef(appState);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  function handleAccessCodeChange(value) {
    setAccessCode(value);
    try { localStorage.setItem("vant_access_code", value); } catch { /* storage unavailable */ }
  }

  function profileFromUser(authUser) {
    return {
      id: authUser.id,
      name: authUser.user_metadata?.name || authUser.email?.split("@")[0] || "User",
      email: authUser.email || "",
    };
  }

  async function loadUserState(authUser) {
    if (!authUser) {
      setUser(null);
      setStateReady(false);
      setAppState({ theme: "dark", cowork_tasks: [], cowork_history: [] });
      setThemeName("dark");
      return;
    }

    setUser(profileFromUser(authUser));
    setStateReady(false);

    const { data, error } = await supabase
      .from("app_state")
      .select("user_id, theme, cowork_tasks, cowork_history")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (error) {
      console.error("VANT: failed to load app_state", error);
      setAppState({ theme: "dark", cowork_tasks: [], cowork_history: [] });
      setThemeName("dark");
      setStateReady(true);
      return;
    }

    const nextState = {
      theme: data?.theme === "light" ? "light" : "dark",
      cowork_tasks: Array.isArray(data?.cowork_tasks) ? data.cowork_tasks : [],
      cowork_history: Array.isArray(data?.cowork_history) ? data.cowork_history : [],
    };

    if (!data) {
      const { error: insertError } = await supabase.from("app_state").upsert({
        user_id: authUser.id,
        theme: nextState.theme,
        cowork_tasks: nextState.cowork_tasks,
        cowork_history: nextState.cowork_history,
      }, { onConflict: "user_id" });
      if (insertError) console.error("VANT: failed to create app_state", insertError);
    }

    appStateRef.current = nextState;
    setAppState(nextState);
    setThemeName(nextState.theme);
    setStateReady(true);
  }

  useEffect(() => {
    let activeSubscription = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (activeSubscription) await loadUserState(data.session?.user || null);
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!activeSubscription) return;
      if (event === "SIGNED_OUT") {
        loadUserState(null);
        return;
      }
      if (session?.user) setTimeout(() => loadUserState(session.user), 0);
    });

    return () => {
      activeSubscription = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!themeLoaded || !stateReady || !user?.id) return;
    if (themeName !== appStateRef.current.theme) {
      appStateRef.current = { ...appStateRef.current, theme: themeName };
      setAppState(appStateRef.current);
      supabase.from("app_state").upsert({
        user_id: user.id,
        theme: themeName,
        cowork_tasks: appStateRef.current.cowork_tasks,
        cowork_history: appStateRef.current.cowork_history,
      }, { onConflict: "user_id" }).then(({ error }) => {
        if (error) console.error("VANT: failed to save theme", error);
      });
    }
  }, [themeName, themeLoaded, stateReady, user?.id]);

  useEffect(() => {
    if (!themeLoaded) setThemeLoaded(true);
  }, [themeLoaded]);

  async function persistAppState(patch) {
    if (!user?.id || !stateReady) return;
    const next = { ...appStateRef.current, ...patch };
    appStateRef.current = next;
    setAppState(next);

    const { error } = await supabase.from("app_state").upsert({
      user_id: user.id,
      theme: next.theme,
      cowork_tasks: next.cowork_tasks,
      cowork_history: next.cowork_history,
    }, { onConflict: "user_id" });

    if (error) console.error("VANT: failed to save app_state", error);
  }

  const isDark = themeName === "dark";
  const theme = THEMES[themeName];

  async function handleAuth({ mode, name, email, password }) {
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });

      if (error) return { error: error.message };

      if (!data.session) {
        return { message: "Account created. Check your email to confirm your account, then log in." };
      }

      return {};
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return {};
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setSettingsOpen(false);
  }

  async function handleClearData() {
    if (!user?.id) return;
    await persistAppState({ theme: "dark", cowork_tasks: [], cowork_history: [] });
    setThemeName("dark");
    setSettingsOpen(false);
  }

  const toggleTheme = () => setThemeName((t) => (t === "dark" ? "light" : "dark"));

  function toggleIntegration(name) {
    setConnected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function renderPage() {
    const props = { theme, isDark };
    if (active === "chat") return <ChatPage {...props} />;
    if (active === "tools") return <ToolsPage {...props} />;
    if (active === "dashboard") return <DashboardPage {...props} connected={connected} coworkTasks={appState.cowork_tasks} onGoToIntegrations={() => setActive("integrations")} />;
    if (active === "cowork") return <CoworkPage {...props} initialTasks={appState.cowork_tasks} initialHistory={appState.cowork_history} stateReady={stateReady} onPersist={persistAppState} />;
    return <IntegrationsPage {...props} connected={connected} onToggle={toggleIntegration} />;
  }

  const pageLabel = (NAV.find((n) => n.id === active) || {}).label || "";

  if (!stateReady && user) {
    // Keep the existing shell visible while account state is loading.
  }

  return (
    <div style={{ height: "100vh", minHeight: 640, display: "flex", background: theme.bg, color: theme.text, fontFamily: "'DM Sans', system-ui, sans-serif", overflow: "hidden" }}>
      <style>{FONT_IMPORT}</style>
      <Sidebar active={active} onSelect={setActive} theme={theme} isDark={isDark} onToggleTheme={toggleTheme} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar theme={theme} isDark={isDark} user={user} pageLabel={pageLabel} onOpenAuth={() => setAuthMode("signup")} onOpenSettings={() => setSettingsOpen(true)} />
        <div style={{ flex: 1, minHeight: 0 }}>{renderPage()}</div>
      </div>
      {authMode && <AuthModal mode={authMode} setMode={setAuthMode} theme={theme} isDark={isDark} onClose={() => setAuthMode(null)} onAuth={handleAuth} />}
      {settingsOpen && <SettingsModal theme={theme} isDark={isDark} onToggleTheme={toggleTheme} user={user} onClose={() => setSettingsOpen(false)} onLogout={handleLogout} onClearData={handleClearData} accessCode={accessCode} onAccessCodeChange={handleAccessCodeChange} />}
    </div>
  );
}
