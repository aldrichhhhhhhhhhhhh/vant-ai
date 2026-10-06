import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { parseAttachment } from "./chatAttachmentParser";
import { supabase } from "./supabase";
import {
  buildVantWorkEnvelope,
  buildVantSystemPrompt,
} from "./vantEngine";
import { MessageSquare, LayoutDashboard, Briefcase, Plug, Wrench, Send, Plus, Trash2, Pencil, Check, X, ArrowLeft, Calculator, FileSpreadsheet, Sun, Moon, Sparkles, History, LogIn, Settings, Truck, Boxes, RefreshCw, Package, ClipboardList, ListChecks, Paperclip, Camera, Copy, Square, FolderPlus, ChevronRight, Palette, Puzzle, Globe, Search, FileText, Target, Image as ImageIcon, Link2, FolderKanban, Users, UserPlus, ThumbsUp, ThumbsDown, Flag, MoreHorizontal } from "lucide-react";

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
  { id: "projects", label: "Projects", icon: FolderKanban, accentKey: "violet" },
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

const CHAT_HISTORY_LIMIT = 50;
const CHAT_GUEST_KEY = "vant_chat_history_guest";

function newChatId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function chatStorageKey(userId) {
  return userId ? `vant_chat_history_${userId}` : CHAT_GUEST_KEY;
}

function deriveChatTitle(messages) {
  const firstUser = messages.find((m) => m?.role === "user");
  const raw = typeof firstUser?.content === "string"
    ? firstUser.content
    : Array.isArray(firstUser?.content)
      ? firstUser.content.filter((p) => p?.type === "text").map((p) => p.text || "").join(" ")
      : "";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New VANT chat";
  return cleaned.length > 48 ? `${cleaned.slice(0, 48).trimEnd()}…` : cleaned;
}

function sanitizeMessagesForPersistence(messages) {
  return messages.map((message) => {
    if (typeof message?.content === "string") return { ...message };
    if (!Array.isArray(message?.content)) return { role: message?.role || "assistant", content: "" };
    const content = message.content.map((part) => {
      if (part?.type === "text") return { type: "text", text: String(part.text || "") };
      if (part?.type === "image_url") return { type: "text", text: "[Image attachment retained for this session; image data is not stored in chat history.]" };
      return { type: "text", text: "[Unsupported attachment content omitted from saved history.]" };
    });
    return { role: message.role, content };
  });
}

function normalizeConversation(row) {
  const messages = Array.isArray(row?.messages) ? row.messages : [];
  return {
    id: row.id,
    title: row.title || deriveChatTitle(messages),
    pinned: Boolean(row.pinned),
    projectId: row.project_id || null,
    messages,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

function sortConversations(items) {
  return [...items].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  }).slice(0, CHAT_HISTORY_LIMIT);
}

async function askClaude(
  systemPrompt,
  messages,
  onChunk,
  timeoutMs = 58000,
  externalSignal = null,
  stream = true,
  requestOptions = null
) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let accessCode = "";
  let accessToken = "";

  try {
    accessCode = localStorage.getItem("vant_access_code") || "";
  } catch {
    /* no storage access */
  }

  try {
    const { data } = await supabase.auth.getSession();
    accessToken = data.session?.access_token || "";
  } catch {
    /* auth session may be unavailable */
  }

  if (!accessToken) {
    clearTimeout(timer);
    return "Your VANT session has expired. Please log in again.";
  }

  try {
    const response = await fetch("/api/chat", {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-access-code": accessCode,
        "Authorization": `Bearer ${accessToken}`,
      },

      body: JSON.stringify({
        system: systemPrompt,
        messages,
        stream,
        ...(requestOptions || {}),
      }),

      signal: controller.signal,
    });

    if (!response.ok) {
      let data = {};

      try {
        data = await response.json();
      } catch {
        /* ignore invalid error JSON */
      }

      if (data?.error === "access_not_configured") {
        clearTimeout(timer);
        return "This deployment hasn't set an access code yet — set APP_ACCESS_CODE in your environment variables.";
      }

      if (data?.error === "invalid_access_code") {
        clearTimeout(timer);
        return "Wrong or missing access code. Enter the correct one in Settings.";
      }

      if (data?.error === "payload_too_large") {
        clearTimeout(timer);
        return "That request was too large — try a smaller image or fewer attachments.";
      }

      if (data?.error === "missing_api_key") {
        clearTimeout(timer);
        return "The server isn't configured with an NVIDIA API key yet — set NVIDIA_API_KEY in your deployment's environment variables.";
      }

      if (data?.error === "nvidia_timeout") {
        clearTimeout(timer);
        return "VANT's model request timed out before the model could finish. Try the request again with a shorter prompt.";
      }

      clearTimeout(timer);

      return data?.detail
        ? `NVIDIA NIM error: ${data.detail}`
        : "The server had trouble reaching the model. Try again in a moment.";
    }

    if (!stream) {
      let data = {};

      try {
        data = await response.json();
      } catch {
        clearTimeout(timer);
        return "The model returned an invalid response. Please try again.";
      }

      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener("abort", abortFromCaller);

      const text =
        typeof data?.content?.[0]?.text === "string"
          ? data.content[0].text
          : typeof data?.choices?.[0]?.message?.content === "string"
            ? data.choices[0].message.content
            : "";

      return text.trim() || "I couldn't generate a response — try again.";
    }

    if (!response.body) {
      clearTimeout(timer);
      return "The model returned an empty stream. Please try again.";
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let fullText = "";
    let streamFinished = false;

    function processLine(line) {
      const trimmed = line.trim();

      if (!trimmed) {
        return false;
      }

      if (!trimmed.startsWith("data:")) {
        return false;
      }

      const payload = trimmed.slice(5).trim();

      if (!payload) {
        return false;
      }

      if (payload === "[DONE]") {
        return true;
      }

      try {
        const event = JSON.parse(payload);

        const delta = event?.choices?.[0]?.delta;

        const piece =
          typeof delta?.content === "string"
            ? delta.content
            : typeof event?.choices?.[0]?.text === "string"
              ? event.choices[0].text
              : "";

        if (piece) {
          fullText += piece;

          if (typeof onChunk === "function") {
            onChunk(fullText);
          }
        }
      } catch {
        /*
          SSE chunks can occasionally arrive incomplete.
          Leave them alone and continue reading.
        */
      }

      return false;
    }

    while (!streamFinished) {
      const {
        value,
        done: readerDone,
      } = await reader.read();

      if (readerDone) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const lines = buffer.split("\n");

      buffer = lines.pop() || "";

      for (const line of lines) {
        if (processLine(line)) {
          streamFinished = true;
          break;
        }
      }
    }

    if (buffer.trim()) {
      processLine(buffer);
    }

    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromCaller);

    return (
      fullText.trim() ||
      "I couldn't generate a response — try rephrasing."
    );
  } catch (err) {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener("abort", abortFromCaller);

    if (err?.name === "AbortError") {
      if (externalSignal?.aborted) return "__VANT_USER_STOPPED__";
      return "VANT stopped waiting for the model after 58 seconds. Try a shorter request.";
    }

    console.error(
      "VANT Chat streaming error:",
      err
    );

    return "Something went wrong reaching the server. Try again in a moment.";
  }
}


function Sidebar({ active, onSelect, theme, isDark, onToggleTheme, onOpenSettings }) {
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
        onClick={onOpenSettings}
        title="Settings"
        style={{ marginTop: "auto", width: 44, height: 44, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        <Settings size={17} color={theme.textMuted} />
      </button>
      <button
        onClick={onToggleTheme}
        title={isDark ? "Switch to Day theme" : "Switch to Dark theme"}
        style={{ width: 44, height: 44, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.surface, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
      >
        {isDark ? <Sun size={17} color={theme.textMuted} /> : <Moon size={17} color={theme.textMuted} />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------
function normalizeProject(row) {
  return {
    id: row.id,
    ownerId: row.owner_id || null,
    name: row.name || "Untitled project",
    description: row.description || "",
    color: row.color || "violet",
    icon: row.icon || "folder",
    priority: row.priority || "moderate",
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
  };
}

const PROJECT_COLORS = ["violet", "cyan", "green", "amber", "red"];
const PROJECT_PRIORITIES = [
  { value: "high", label: "High" },
  { value: "moderate", label: "Moderate" },
  { value: "low", label: "Low" },
];

function ProjectTeamChat({ theme, isDark, project, user, onClose }) {
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [onlineMembers, setOnlineMembers] = useState([]);
  const [vantMode, setVantMode] = useState("team");
  const scrollRef = useRef(null);

  async function loadMessages() {
    const { data, error } = await supabase
      .from("project_messages")
      .select("id, project_id, user_id, content, sender_type, created_at, edited_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true })
      .limit(200);
    if (!error) setMessages(data || []);
    else console.error("VANT: failed to load team messages", error);
    setLoading(false);
  }

  async function loadMembers() {
    const { data, error } = await supabase
      .from("project_members")
      .select("id, user_id, role, email, display_name, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true });
    if (!error) setMembers(data || []);
    else console.error("VANT: failed to load project members", error);
  }

  useEffect(() => {
    loadMessages();
    loadMembers();

    const messageChannel = supabase
      .channel("project-messages-" + project.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_messages", filter: "project_id=eq." + project.id }, (payload) => {
        if (payload.eventType === "INSERT") {
          setMessages((current) => current.some((item) => item.id === payload.new.id) ? current : [...current, payload.new]);
        } else if (payload.eventType === "UPDATE") {
          setMessages((current) => current.map((item) => item.id === payload.new.id ? payload.new : item));
        } else if (payload.eventType === "DELETE") {
          setMessages((current) => current.filter((item) => item.id !== payload.old.id));
        }
      })
      .subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") console.error("VANT: team chat realtime error", error || status);
      });

    const memberChannel = supabase
      .channel("project-members-" + project.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_members", filter: "project_id=eq." + project.id }, () => {
        loadMembers();
      })
      .on("presence", { event: "sync" }, () => {
        const state = memberChannel.presenceState();
        setOnlineMembers(Object.values(state).flat());
      })
      .on("presence", { event: "join" }, () => {
        const state = memberChannel.presenceState();
        setOnlineMembers(Object.values(state).flat());
      })
      .on("presence", { event: "leave" }, () => {
        const state = memberChannel.presenceState();
        setOnlineMembers(Object.values(state).flat());
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && user?.id) {
          await memberChannel.track({ user_id: user.id, name: user.name, email: user.email });
        }
      });

    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(memberChannel);
    };
  }, [project.id, user?.id]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  async function sendMessage(e) {
    e?.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);

    const { error } = await supabase.from("project_messages").insert({
      project_id: project.id,
      user_id: user.id,
      content,
      sender_type: "human",
    });

    if (error) {
      console.error("VANT: failed to send team message", error);
      window.alert("VANT couldn't send that message. Please try again.");
      setSending(false);
      return;
    }

    setInput("");

    const vantInvocation = /^@vant\b/i.test(content);
    if (vantMode === "team_vant" && vantInvocation) {
      const cleanPrompt = content.replace(/^@vant\s*/i, "").trim() || "Join the team conversation and help us move the project forward.";
      const history = [...messages, { id: "local-" + Date.now(), project_id: project.id, user_id: user.id, content, sender_type: "human", created_at: new Date().toISOString() }];
      const teamContext = history
        .slice(-24, -1)
        .map((message) => {
          const speaker = message.sender_type === "vant" ? "VANT" : memberName(message.user_id);
          return speaker + ": " + message.content;
        })
        .join("\n");

      const vantPrompt =
        "You are VANT participating inside a shared project Team Chat.\n\n" +
        "PROJECT: \"" + project.name + "\"\n" +
        "PROJECT DESCRIPTION: " + (project.description || "No description provided.") + "\n\n" +
        "ROLE:\nYou are a participating team member, not the owner of the conversation.\n" +
        "Only respond when explicitly called with @VANT.\n" +
        "Use the team conversation as context.\n" +
        "Do not invent project facts, decisions, files, or actions.\n" +
        "Do not claim to have completed external work.\n" +
        "Be concise enough for a team chat, but provide useful structure when needed.\n" +
        "If the team asks you to summarize, summarize only the visible conversation.\n" +
        "If the team asks what to do next, give concrete next steps.\n" +
        "If information is missing, say what is missing.\n\n" +
        "RECENT TEAM CHAT:\n" +
        (teamContext || "No earlier team messages.") +
        "\n\nEXPLICIT REQUEST FROM THE TEAM:\n" +
        cleanPrompt;

      const reply = await askClaude(
        vantPrompt,
        [{ role: "user", content: cleanPrompt }],
        null,
        58000,
        null,
        false,
        { model: "openai/gpt-oss-20b", max_tokens: 768 }
      );

      const isModelFailure =
        !reply ||
        reply.startsWith("The server had trouble reaching the model.") ||
        reply.startsWith("Something went wrong reaching the server.") ||
        reply.startsWith("NVIDIA NIM error:") ||
        reply.startsWith("VANT's model request timed out") ||
        reply === "__VANT_USER_STOPPED__";

      if (isModelFailure) {
        console.error("VANT: Team + VANT model call failed", reply);
        window.alert(reply === "__VANT_USER_STOPPED__" ? "VANT stopped the response." : reply);
      } else {
        const { error: vantError } = await supabase.from("project_messages").insert({
          project_id: project.id,
          user_id: user.id,
          content: reply,
          sender_type: "vant",
        });

        if (vantError) {
          console.error("VANT: failed to save team VANT response", vantError);
          window.alert("VANT generated a response but couldn't save it to the team room.");
        }
      }
    }
    setSending(false);
  }

  function memberName(userId) {
    const member = members.find((item) => item.user_id === userId);
    return member?.display_name || member?.email?.split("@")[0] || (userId === user?.id ? user.name : "VANT User");
  }

  const onlineIds = new Set(onlineMembers.map((item) => item.user_id));
  const accent = ac(project.color, isDark);

  return (
    <div role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.62)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div style={{ width: "min(760px, 100%)", height: "min(720px, 88vh)", background: theme.surfaceCard, border: "1px solid " + theme.borderStrong, borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.35)" }}>
        <div style={{ padding: "15px 18px", borderBottom: "1px solid " + theme.border, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: acBg(project.color), display: "flex", alignItems: "center", justifyContent: "center" }}><Users size={17} color={accent} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9.5, letterSpacing: 1.1, color: theme.textFaint }}>VANT · TEAM CHAT</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{project.name}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: 3, border: "1px solid " + theme.border, borderRadius: 10, background: theme.surface }}>
            <button type="button" onClick={() => setVantMode("team")} style={{ border: "none", borderRadius: 7, padding: "6px 9px", background: vantMode === "team" ? theme.surfaceStrong : "transparent", color: vantMode === "team" ? theme.text : theme.textMuted, cursor: "pointer", fontSize: 10.5, fontWeight: 600 }}>TEAM ONLY</button>
            <button type="button" onClick={() => setVantMode("team_vant")} style={{ border: "none", borderRadius: 7, padding: "6px 9px", background: vantMode === "team_vant" ? acBg(project.color) : "transparent", color: vantMode === "team_vant" ? accent : theme.textMuted, cursor: "pointer", fontSize: 10.5, fontWeight: 600 }}>TEAM + VANT</button>
          </div>
          <div style={{ fontSize: 11.5, color: theme.textMuted }}>{onlineMembers.length} online</div>
          <button type="button" onClick={onClose} aria-label="Close team chat" style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid " + theme.border, background: theme.surface, color: theme.textMuted, cursor: "pointer" }}><X size={15} /></button>
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 18 }}>
          {loading ? <div style={{ color: theme.textMuted, fontSize: 13 }}>Loading team chat…</div> : messages.length === 0 ? (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: theme.textMuted, fontSize: 13 }}>
              <div><Users size={24} color={accent} /><div style={{ marginTop: 9, fontWeight: 600, color: theme.text }}>Your team room is ready.</div><div style={{ marginTop: 4 }}>Start the first shared project conversation.</div></div>
            </div>
          ) : messages.map((message) => {
            const isVant = message.sender_type === "vant";
            const own = !isVant && message.user_id === user?.id;
            return (
              <div key={message.id} style={{ display: "flex", justifyContent: isVant ? "flex-start" : own ? "flex-end" : "flex-start", marginBottom: 12 }}>
                <div style={{ maxWidth: "78%", padding: "10px 13px", borderRadius: isVant ? "14px 14px 14px 4px" : own ? "14px 14px 4px 14px" : "14px 14px 14px 4px", background: isVant ? "rgba(124,58,237,0.10)" : own ? acBg(project.color) : theme.surface, border: "1px solid " + (isVant ? "rgba(167,139,250,0.28)" : theme.border) }}>
                  <div style={{ fontSize: 11, color: isVant ? ac("violet", isDark) : accent, fontWeight: 700, marginBottom: 4 }}>{isVant ? "VANT" : memberName(message.user_id)}</div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 13.5 }}>{message.content}</div>
                  <div style={{ fontSize: 9.5, color: theme.textFaint, marginTop: 5 }}>{new Date(message.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div>
                </div>
              </div>
            );
          })}
        </div>
        <form onSubmit={sendMessage} style={{ padding: 12, borderTop: "1px solid " + theme.border, display: "flex", gap: 8 }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={vantMode === "team_vant" ? "Message team or @VANT to call VANT…" : "Message your project team…"} disabled={sending} autoFocus style={{ flex: 1, minWidth: 0, padding: "11px 14px", borderRadius: 12, border: "1px solid " + theme.borderStrong, background: theme.inputBg, color: theme.text, outline: "none", fontSize: 13.5 }} />
          <button type="submit" disabled={!input.trim() || sending} style={{ width: 44, borderRadius: 12, border: "none", background: accent, color: isDark ? "#0b0d13" : "#fff", cursor: input.trim() && !sending ? "pointer" : "not-allowed", opacity: input.trim() && !sending ? 1 : 0.45 }}><Send size={16} /></button>
        </form>
      </div>
    </div>
  );
}

function ProjectWorkspace({ theme, isDark, project, chats = [], user, onBack, onCustomize, onNewChat, onOpenChat, onAskVant, onProjectLeft }) {
  const [workspacePanel, setWorkspacePanel] = useState(null);
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("collaborator");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const [teamChatOpen, setTeamChatOpen] = useState(false);
  const isOwner = project.ownerId === user?.id;
  if (!project) return null;

  async function loadMembers() {
    const { data, error } = await supabase.from("project_members").select("id, user_id, role, email, display_name, created_at").eq("project_id", project.id).order("created_at", { ascending: true });
    if (!error) setMembers(data || []);
    else console.error("VANT: failed to load project members", error);
  }

  useEffect(() => {
    loadMembers();
    const channel = supabase.channel("workspace-members-" + project.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_members", filter: "project_id=eq." + project.id }, () => loadMembers())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project.id]);

  async function inviteMember(e) {
    e?.preventDefault();
    if (!isOwner || !inviteEmail.trim() || inviteBusy) return;
    setInviteBusy(true);
    setInviteMessage("");
    const { data, error } = await supabase.rpc("invite_project_member", {
      p_project_id: project.id,
      p_email: inviteEmail.trim(),
      p_role: inviteRole,
    });
    setInviteBusy(false);
    if (error) {
      const message = error.message?.includes("user_not_found") ? "No VANT account was found for that email." : error.message?.includes("not_project_owner") ? "Only the project owner can invite members." : "VANT couldn't add that member.";
      setInviteMessage(message);
      return;
    }
    setInviteEmail("");
    setInviteMessage(data?.[0]?.display_name ? data[0].display_name + " added to the project." : "Member added.");
    loadMembers();
  }

  async function manageMember(member, action, role = null) {
    if (!isOwner || !member?.user_id || member.role === "owner") return;
    setInviteMessage("");
    const { data, error } = await supabase.rpc("manage_project_member", {
      p_project_id: project.id,
      p_user_id: member.user_id,
      p_action: action,
      p_role: role,
    });
    if (error) {
      const message = error.message?.includes("not_project_owner")
        ? "Only the project owner can manage members."
        : error.message?.includes("invalid_role")
          ? "That role is not available."
          : "VANT couldn't update that member.";
      setInviteMessage(message);
      return;
    }
    await loadMembers();
    const updated = data?.[0];
    setInviteMessage(
      action === "remove"
        ? `${member.display_name || "Member"} removed from the project.`
        : `${updated?.display_name || member.display_name || "Member"} is now a ${updated?.role || role}.`
    );
  }

  async function leaveProject() {
    if (isOwner) return;
    setInviteMessage("");
    const { error } = await supabase.rpc("leave_project", { p_project_id: project.id });
    if (error) {
      setInviteMessage(
        error.message?.includes("owner_cannot_leave")
          ? "The project owner cannot leave this project."
          : "VANT couldn't leave this project."
      );
      return;
    }
    onProjectLeft?.(project.id);
    onBack();
  }

  function openWorkspaceWidget(widget) {
    if (widget === "chats") {
      if (chats.length) onOpenChat(chats[0].id); else onNewChat();
      return;
    }
    if (widget === "team") {
      setWorkspacePanel("team");
      return;
    }
    setWorkspacePanel(widget);
  }
  const color = PROJECT_COLORS.includes(project.color) ? project.color : "violet";
  const priority = PROJECT_PRIORITIES.find((item) => item.value === project.priority)?.label || "Moderate";
  const recentChats = chats.slice(0, 5);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 34px 40px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <button type="button" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "none", background: "transparent", color: theme.textMuted, cursor: "pointer", padding: 0, marginBottom: 22 }}>
          <ArrowLeft size={15} /> All Projects
        </button>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 15, alignItems: "flex-start" }}>
            <div style={{ width: 52, height: 52, borderRadius: 15, background: acBg(color), display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid " + theme.border }}>
              <FolderKanban size={23} color={ac(color, isDark)} />
            </div>
            <div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, letterSpacing: 1.3, color: ac(color, isDark), marginBottom: 5 }}>VANT · PROJECT WORKSPACE</div>
              <h1 style={{ margin: 0, fontFamily: "Fraunces, serif", fontSize: 32, fontWeight: 500 }}>{project.name}</h1>
              <p style={{ margin: "7px 0 0", color: theme.textMuted, fontSize: 14 }}>{project.description || "No project description yet."}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            {isOwner && <button type="button" onClick={() => onCustomize(project.id)} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid " + theme.border, borderRadius: 10, padding: "9px 12px", background: theme.surface, color: theme.text, cursor: "pointer" }}><Palette size={15} /> Customize</button>}
            <button type="button" onClick={onAskVant} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid " + theme.border, borderRadius: 10, padding: "9px 12px", background: theme.surface, color: theme.text, cursor: "pointer" }}><Sparkles size={15} /> Ask VANT</button>
            <button type="button" onClick={onNewChat} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "none", borderRadius: 10, padding: "9px 13px", background: acBg(color), color: ac(color, isDark), cursor: "pointer", fontWeight: 600 }}><Plus size={15} /> New Chat</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <span style={{ padding: "6px 10px", borderRadius: 999, background: acBg(color), color: ac(color, isDark), fontSize: 12, fontWeight: 600 }}>Priority · {priority}</span>
          <span style={{ padding: "6px 10px", borderRadius: 999, background: theme.surface, border: "1px solid " + theme.border, color: theme.textMuted, fontSize: 12 }}>{isOwner ? "Owner workspace" : "Shared workspace"}</span>
          <span style={{ padding: "6px 10px", borderRadius: 999, background: theme.surface, border: "1px solid " + theme.border, color: ac("green", isDark) }}>● Active</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 16 }}>
          {[
            { icon: MessageSquare, label: "PROJECT CHATS", value: chats.length, detail: chats.length ? "Your conversations in this workspace" : "Ready for your first chat" },
            { icon: Target, label: "PRIORITY", value: priority, detail: "Attached to this workspace" },
            { icon: Users, label: "TEAM", value: String(members.length), detail: members.length === 1 ? "You · collaboration ready" : "Project members" },
            { icon: FolderKanban, label: "WORKSPACE", value: "Active", detail: isOwner ? "Owner-controlled workspace" : "Shared with you" },
          ].map(({ icon: Icon, label, value, detail }) => (
            <div key={label} style={{ background: theme.surfaceCard, border: "1px solid " + theme.border, borderRadius: 15, padding: 15 }}>
              <Icon size={16} color={ac(color, isDark)} />
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9.5, letterSpacing: 1, color: theme.textFaint, marginTop: 10 }}>{label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, marginTop: 4 }}>{value}</div>
              <div style={{ color: theme.textFaint, fontSize: 11.5, marginTop: 3 }}>{detail}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "0 0 9px" }}>
          <div><div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: 1.2, color: theme.textFaint }}>COMMAND CENTER</div><div style={{ fontSize: 15, fontWeight: 600, marginTop: 3 }}>Move the project forward</div></div>
          <div style={{ color: theme.textFaint, fontSize: 11.5 }}>Everything starts here</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 10, marginBottom: 16 }}>
          <button type="button" onClick={onAskVant} style={{ textAlign: "left", padding: 14, borderRadius: 14, background: acBg(color), border: "1px solid " + theme.border, color: theme.text, cursor: "pointer" }}><Sparkles size={17} color={ac(color, isDark)} /><div style={{ fontWeight: 600, marginTop: 10, fontSize: 13.5 }}>Ask VANT</div><div style={{ color: theme.textMuted, fontSize: 11.5, marginTop: 3 }}>Work through this project with project-aware context.</div></button>
          <button type="button" onClick={onNewChat} style={{ textAlign: "left", padding: 14, borderRadius: 14, background: theme.surface, border: "1px solid " + theme.border, color: theme.text, cursor: "pointer" }}><Plus size={17} color={ac("cyan", isDark)} /><div style={{ fontWeight: 600, marginTop: 10, fontSize: 13.5 }}>Start New Chat</div><div style={{ color: theme.textMuted, fontSize: 11.5, marginTop: 3 }}>Open a clean conversation inside this workspace.</div></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {[
            { key: "dashboard", icon: LayoutDashboard, title: "Project Dashboard", text: "Open the project command center and current workspace state.", status: "OPEN" },
            { key: "chats", icon: MessageSquare, title: "Chats", text: chats.length ? "Open the latest conversation inside this project." : "Start the first conversation inside this project.", status: chats.length ? "OPEN" : "START" },
            { key: "team", icon: Users, title: "Team", text: "View members, invite collaborators, and open the shared Team Chat.", status: "LIVE" },
            { key: "space", icon: FolderKanban, title: "Project Space", text: "View this project's identity, priority, ownership, and workspace data.", status: "OPEN" },
          ].map(({ key, icon: Icon, title, text, status }) => (
            <button key={title} type="button" onClick={() => openWorkspaceWidget(key)} style={{ textAlign: "left", background: theme.surfaceCard, border: "1px solid " + theme.border, borderRadius: 16, padding: 18, minHeight: 130, color: theme.text, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><Icon size={18} color={ac(color, isDark)} /><span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9.5, letterSpacing: 1, color: key === "team" ? ac("green", isDark) : theme.textFaint }}>{status}</span></div>
              <div style={{ fontWeight: 600, marginTop: 15 }}>{title}</div><div style={{ color: theme.textMuted, fontSize: 12.5, lineHeight: 1.55, marginTop: 6 }}>{text}</div><div style={{ color: ac(color, isDark), fontSize: 11, marginTop: 10, fontWeight: 600 }}>Open →</div>
            </button>
          ))}
        </div>
        {workspacePanel && (
          <div role="dialog" aria-modal="true" onMouseDown={(e) => { if (e.target === e.currentTarget) setWorkspacePanel(null); }} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div style={{ width: "min(560px, 100%)", maxHeight: "80vh", overflowY: "auto", background: theme.surfaceCard, border: "1px solid " + theme.borderStrong, borderRadius: 18, padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div><div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: 1.2, color: ac(color, isDark) }}>VANT · PROJECT</div><h2 style={{ margin: "6px 0 0", fontSize: 21 }}>{workspacePanel === "team" ? "Team" : workspacePanel === "space" ? "Project Space" : "Project Dashboard"}</h2></div>
                <button type="button" onClick={() => setWorkspacePanel(null)} aria-label="Close project panel" style={{ border: "1px solid " + theme.border, background: theme.surface, color: theme.textMuted, borderRadius: 9, width: 32, height: 32, cursor: "pointer" }}><X size={15} /></button>
              </div>
              {workspacePanel === "dashboard" && <div style={{ marginTop: 20, display: "grid", gap: 10 }}><div style={{ padding: 14, borderRadius: 12, background: theme.surface, border: "1px solid " + theme.border }}><div style={{ color: theme.textFaint, fontSize: 11 }}>PROJECT STATUS</div><div style={{ fontSize: 18, fontWeight: 600, marginTop: 5 }}>Active</div><div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>{chats.length} project chat{chats.length === 1 ? "" : "s"} currently attached.</div></div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><button type="button" onClick={onAskVant} style={{ padding: 13, borderRadius: 11, border: "1px solid " + theme.border, background: acBg(color), color: theme.text, cursor: "pointer", textAlign: "left" }}><Sparkles size={15} /><div style={{ fontWeight: 600, marginTop: 7 }}>Ask VANT</div></button><button type="button" onClick={onNewChat} style={{ padding: 13, borderRadius: 11, border: "1px solid " + theme.border, background: theme.surface, color: theme.text, cursor: "pointer", textAlign: "left" }}><Plus size={15} /><div style={{ fontWeight: 600, marginTop: 7 }}>New Chat</div></button></div></div>}
              {workspacePanel === "team" && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div><div style={{ fontWeight: 600 }}>Project members</div><div style={{ color: theme.textMuted, fontSize: 12 }}>Changes update live.</div></div>
                    <button type="button" onClick={() => setTeamChatOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 9, border: "1px solid " + theme.border, background: acBg(color), color: ac(color, isDark), cursor: "pointer", fontSize: 12, fontWeight: 600 }}><MessageSquare size={13} /> Team Chat</button>
                    {!isOwner && <button type="button" onClick={leaveProject} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 9, border: "1px solid " + theme.border, background: "transparent", color: ac("red", isDark), cursor: "pointer", fontSize: 12, fontWeight: 600 }}><ArrowLeft size={13} /> Leave Project</button>}
                  </div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {members.map((member) => {
                      const online = member.user_id === user?.id;
                      const isMemberOwner = member.role === "owner";
                      return <div key={member.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 11px", border: "1px solid " + theme.border, borderRadius: 11, background: theme.surface }}>
                        <div style={{ width: 30, height: 30, borderRadius: 9, background: acBg(color), display: "flex", alignItems: "center", justifyContent: "center", color: ac(color, isDark), fontWeight: 600, fontSize: 12 }}>{(member.display_name || "V").slice(0,1).toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{member.display_name || "VANT User"} {member.user_id === user?.id ? "(You)" : ""}</div>
                          <div style={{ color: theme.textFaint, fontSize: 11.5 }}>{member.role} · {member.email || "VANT account"}</div>
                        </div>
                        <span style={{ fontSize: 10, color: online ? ac("green", isDark) : theme.textFaint }}>{online ? "● YOU" : "MEMBER"}</span>
                        {isOwner && !isMemberOwner && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <select value={member.role} onChange={(e) => manageMember(member, "change_role", e.target.value)} title={`Change role for ${member.display_name || "member"}`} style={{ width: 112, padding: "6px 7px", borderRadius: 8, border: "1px solid " + theme.border, background: theme.inputBg, color: theme.text, fontSize: 11.5 }}>
                              <option value="collaborator">Collaborator</option>
                              <option value="viewer">Viewer</option>
                            </select>
                            <button type="button" onClick={() => manageMember(member, "remove")} title="Remove member" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid " + theme.border, background: "transparent", color: ac("red", isDark), cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={13} /></button>
                          </div>
                        )}
                      </div>;
                    })}
                  </div>
                  {isOwner && <form onSubmit={inviteMember} style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + theme.border }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 8 }}>Invite a VANT user</div>
                    <div style={{ display: "flex", gap: 7 }}>
                      <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="their@email.com" type="email" style={{ flex: 1, minWidth: 0, padding: "9px 11px", borderRadius: 9, border: "1px solid " + theme.borderStrong, background: theme.inputBg, color: theme.text, outline: "none", fontSize: 12.5 }} />
                      <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={{ width: 112, padding: "9px 7px", borderRadius: 9, border: "1px solid " + theme.borderStrong, background: theme.inputBg, color: theme.text, fontSize: 12 }}>
                        <option value="collaborator">Collaborator</option><option value="viewer">Viewer</option>
                      </select>
                      <button type="submit" disabled={inviteBusy || !inviteEmail.trim()} style={{ width: 42, borderRadius: 9, border: "none", background: ac(color, isDark), color: isDark ? "#0b0d13" : "#fff", cursor: inviteBusy ? "wait" : "pointer", opacity: inviteBusy || !inviteEmail.trim() ? 0.5 : 1 }} title="Add member"><UserPlus size={15} /></button>
                    </div>
                    {inviteMessage && <div style={{ color: inviteMessage.includes("added") ? ac("green", isDark) : ac("red", isDark), fontSize: 11.5, marginTop: 7 }}>{inviteMessage}</div>}
                  </form>}
                </div>
              )}
              {workspacePanel === "space" && <div style={{ marginTop: 20 }}><div style={{ display: "grid", gap: 0 }}>{[["Project", project.name],["Description", project.description || "No description"],["Priority", priority],["Color", color],["Chats", String(chats.length)],["Members", String(members.length)],["Status", "Active"]].map(([label,value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 18, padding: "11px 0", borderBottom: "1px solid " + theme.border }}><span style={{ color: theme.textFaint, fontSize: 12 }}>{label}</span><span style={{ color: theme.text, fontSize: 12.5, textAlign: "right", maxWidth: "70%" }}>{value}</span></div>)}</div>{isOwner && <button type="button" onClick={() => { setWorkspacePanel(null); onCustomize(project.id); }} style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid " + theme.border, background: theme.surface, color: theme.text, cursor: "pointer" }}><Palette size={14} /> Customize Project</button>}</div>}
            </div>
          </div>
        )}
        {teamChatOpen && <ProjectTeamChat theme={theme} isDark={isDark} project={project} user={user} onClose={() => setTeamChatOpen(false)} />}

        <div style={{ background: theme.surfaceCard, border: "1px solid " + theme.border, borderRadius: 16, padding: 18, marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div><div style={{ fontWeight: 600 }}>Recent Project Chats</div><div style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>Your conversations that belong to this workspace.</div></div>
            <button type="button" onClick={onNewChat} style={{ border: "none", background: acBg(color), color: ac(color, isDark), borderRadius: 9, padding: "7px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}><Plus size={13} /> New Chat</button>
          </div>
          {recentChats.length ? recentChats.map((chat) => <button key={chat.id} type="button" onClick={() => onOpenChat(chat.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "11px 3px", border: "none", borderTop: "1px solid " + theme.border, background: "transparent", color: theme.text, cursor: "pointer", textAlign: "left" }}><MessageSquare size={15} color={ac(color, isDark)} /><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13.5 }}>{chat.title || "New VANT chat"}</span><ChevronRight size={14} color={theme.textFaint} /></button>) : <div style={{ borderTop: "1px solid " + theme.border, paddingTop: 18, color: theme.textMuted, fontSize: 13, textAlign: "center" }}>No project chats yet. Start one above.</div>}
        </div>
      </div>
    </div>
  );
}
function ProjectsPage({ theme, isDark, projects, user, onProjectsChange, onOpenProject, onDeleteProject, onCustomizeProject, projectSaving }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editColor, setEditColor] = useState("violet");
  const [editPriority, setEditPriority] = useState("moderate");

  async function createProject(e) {
    e?.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || projectSaving) return;
    const created = await onProjectsChange({ name: cleanName, description: description.trim() });
    if (created) {
      setName("");
      setDescription("");
      setCreating(false);
    }
  }

  function startCustomize(project) {
    setEditingId(project.id);
    setEditColor(project.color || "violet");
    setEditPriority(project.priority || "moderate");
  }

  async function saveCustomize(project) {
    await onCustomizeProject(project.id, { color: editColor, priority: editPriority });
    setEditingId(null);
  }

  const card = {
    background: theme.surfaceCard,
    border: "1px solid " + theme.border,
    borderRadius: 16,
    padding: 18,
  };

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 34px 40px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1.4, color: ac("violet", isDark), marginBottom: 8 }}>VANT · PROJECTS</div>
            <h1 style={{ margin: 0, fontFamily: "Fraunces, serif", fontSize: 32, fontWeight: 500 }}>Your workspaces</h1>
            <p style={{ margin: "8px 0 0", color: theme.textMuted, fontSize: 14.5 }}>Every project is its own VANT workspace — persistent, organized, and ready to grow with the work.</p>
          </div>
          <button type="button" onClick={() => setCreating(true)} style={{ display: "flex", alignItems: "center", gap: 8, border: "none", borderRadius: 11, padding: "10px 14px", background: acBg("violet"), color: ac("violet", isDark), cursor: "pointer", fontWeight: 600 }}>
            <FolderPlus size={16} /> New Project
          </button>
        </div>

        {creating && (
          <form onSubmit={createProject} style={{ ...card, marginBottom: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Create a VANT project</div>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: "1px solid " + theme.borderStrong, background: theme.inputBg, color: theme.text, outline: "none", marginBottom: 10 }} />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" rows={3} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", padding: "11px 12px", borderRadius: 10, border: "1px solid " + theme.borderStrong, background: theme.inputBg, color: theme.text, outline: "none" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => { setCreating(false); setName(""); setDescription(""); }} style={{ padding: "9px 13px", borderRadius: 9, border: "1px solid " + theme.border, background: "transparent", color: theme.textMuted, cursor: "pointer" }}>Cancel</button>
              <button type="submit" disabled={!name.trim() || projectSaving} style={{ padding: "9px 13px", borderRadius: 9, border: "none", background: acBg("violet"), color: ac("violet", isDark), cursor: name.trim() && !projectSaving ? "pointer" : "not-allowed", opacity: name.trim() && !projectSaving ? 1 : 0.5 }}>{projectSaving ? "Saving…" : "Create Project"}</button>
            </div>
          </form>
        )}

        {!projects.length ? (
          <div style={{ ...card, textAlign: "center", padding: "64px 24px" }}>
            <div style={{ width: 58, height: 58, borderRadius: 17, background: acBg("violet"), margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}><FolderKanban size={27} color={ac("violet", isDark)} /></div>
            <h3 style={{ margin: "16px 0 6px", fontWeight: 600 }}>No projects yet</h3>
            <p style={{ margin: 0, color: theme.textMuted, fontSize: 14 }}>Create a project and VANT will give it a persistent workspace of its own.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {projects.map((project) => {
              const color = PROJECT_COLORS.includes(project.color) ? project.color : "violet";
              const priority = PROJECT_PRIORITIES.find((item) => item.value === project.priority)?.label || "Moderate";
              const isEditing = editingId === project.id;
              const isOwner = project.ownerId === user?.id;
              return (
                <div key={project.id} style={{ ...card, cursor: "pointer", transition: "transform .15s ease, border-color .15s ease", boxShadow: isDark ? "0 12px 32px rgba(0,0,0,0.16)" : "0 12px 32px rgba(0,0,0,0.06)" }} onClick={() => onOpenProject(project.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: acBg(color), display: "flex", alignItems: "center", justifyContent: "center" }}><FolderKanban size={20} color={ac(color, isDark)} /></div>
                    {isOwner && <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }} title="Delete project" style={{ border: "none", background: "transparent", color: theme.textFaint, cursor: "pointer", padding: 4 }}><Trash2 size={16} /></button>}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 16, marginTop: 17 }}>{project.name}</div>
                  <div style={{ color: theme.textMuted, fontSize: 13, lineHeight: 1.5, marginTop: 6, minHeight: 39 }}>{project.description || "No description"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 15, flexWrap: "wrap" }}>
                    <span style={{ padding: "4px 8px", borderRadius: 999, background: acBg(color), color: ac(color, isDark), fontSize: 11, fontWeight: 600 }}>● {priority}</span>
                    <span style={{ padding: "4px 8px", borderRadius: 999, background: theme.surface, border: "1px solid " + theme.border, color: theme.textFaint, fontSize: 11 }}>{isOwner ? "Owner" : "Shared"}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, color: theme.textFaint, fontSize: 12 }}>
                    <span>Workspace</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, color: ac(color, isDark) }}>Open <ChevronRight size={14} /></span>
                  </div>
                  <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid " + theme.border }}>
                    {!isEditing ? (
                      isOwner ? <button type="button" onClick={() => startCustomize(project)} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", color: theme.textMuted, cursor: "pointer", fontSize: 12, padding: 0 }}>
                        <Palette size={13} /> Customize project
                      </button> : <span style={{ color: theme.textFaint, fontSize: 12 }}>Shared project</span>
                    ) : (
                      <div>
                        <div style={{ fontSize: 11, color: theme.textFaint, marginBottom: 8, fontFamily: "JetBrains Mono, monospace", letterSpacing: 1 }}>PROJECT SETTINGS</div>
                        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 9 }}>
                          {PROJECT_COLORS.map((key) => (
                            <button key={key} type="button" title={key} onClick={() => setEditColor(key)} style={{ width: 25, height: 25, borderRadius: 8, border: editColor === key ? "2px solid " + ac(key, isDark) : "1px solid " + theme.border, background: acBg(key), color: ac(key, isDark), cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>●</button>
                          ))}
                        </div>
                        <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} style={{ width: "100%", padding: "8px 9px", borderRadius: 9, border: "1px solid " + theme.border, background: theme.inputBg, color: theme.text, marginBottom: 9 }}>
                          {PROJECT_PRIORITIES.map((item) => <option key={item.value} value={item.value}>{item.label} priority</option>)}
                        </select>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 7 }}>
                          <button type="button" onClick={() => setEditingId(null)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid " + theme.border, background: "transparent", color: theme.textMuted, cursor: "pointer" }}>Cancel</button>
                          <button type="button" onClick={() => saveCustomize(project)} style={{ padding: "7px 10px", borderRadius: 8, border: "none", background: acBg("violet"), color: ac("violet", isDark), cursor: "pointer" }}>Save</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Chat
// ---------------------------------------------------------------------------
function HistoryPanel({ theme, isDark, conversations, activeConversationId, onNewConversation, onSelectConversation, onTogglePinConversation, onDeleteConversation, projectMode = false, projectName = "", onBackToProject }) {
    const pinned = conversations.filter((item) => item.pinned);
    const recent = conversations.filter((item) => !item.pinned);
    const renderItem = (item) => (
      <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 6px", borderRadius: 9, background: item.id === activeConversationId ? theme.surfaceStrong : "transparent" }}>
        <button type="button" onClick={() => onSelectConversation(item.id)} title={item.title} style={{ minWidth: 0, flex: 1, textAlign: "left", border: "none", background: "transparent", color: theme.text, cursor: "pointer", padding: 0, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</button>
        <button type="button" onClick={() => onTogglePinConversation(item.id)} title={item.pinned ? "Unpin chat" : "Pin chat"} style={{ border: "none", background: "transparent", color: item.pinned ? ac("violet", isDark) : theme.textFaint, cursor: "pointer", padding: 2, fontSize: 12 }}>{item.pinned ? "★" : "☆"}</button>
        <button type="button" onClick={() => onDeleteConversation(item.id)} title="Delete chat" style={{ border: "none", background: "transparent", color: theme.textFaint, cursor: "pointer", padding: 2 }}><Trash2 size={13} /></button>
      </div>
    );
    return (
      <aside style={{ width: 270, flexShrink: 0, borderRight: `1px solid ${theme.border}`, background: theme.sidebarBg, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, letterSpacing: 1.2, color: projectMode ? ac("violet", isDark) : theme.textFaint }}>{projectMode ? "PROJECT CHAT" : "CHAT HISTORY"}</div>
              <div style={{ marginTop: 3, fontSize: 15, fontWeight: 600 }}>{projectMode ? projectName || "Project workspace" : "Your chats"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {projectMode && <button type="button" onClick={onBackToProject} title="Back to project workspace" style={{ height: 34, padding: "0 9px", borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textMuted, display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11.5 }}><ArrowLeft size={14} /> Project</button>}
              <button type="button" onClick={onNewConversation} title="New chat" style={{ width: 34, height: 34, borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textMuted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Plus size={16} /></button>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 9px 14px" }}>
          {pinned.length > 0 && <div style={{ margin: "4px 6px 6px", fontSize: 11, fontWeight: 600, color: theme.textFaint }}>Pinned</div>}
          {pinned.map(renderItem)}
          {recent.length > 0 && <div style={{ margin: "16px 6px 6px", fontSize: 11, fontWeight: 600, color: theme.textFaint }}>Recents</div>}
          {recent.map(renderItem)}
          {!conversations.length && <div style={{ padding: "28px 12px", color: theme.textFaint, fontSize: 12.5, lineHeight: 1.5 }}>{projectMode ? "Project conversations stay inside this workspace." : "Your completed conversations will appear here automatically."}</div>}
        </div>
      </aside>
    );
  }

  function AttachmentPreview({ file, theme, isDark, size = 58 }) {
    const [src, setSrc] = useState("");

    useEffect(() => {
      if (!file || !(file.type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(file.name || ""))) {
        setSrc("");
        return undefined;
      }
      const url = URL.createObjectURL(file);
      setSrc(url);
      return () => URL.revokeObjectURL(url);
    }, [file]);

    if (!src) return <div style={{ width: size, height: size, borderRadius: 10, background: theme.surfaceStrong, border: `1px solid ${theme.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><FileText size={18} color={theme.textMuted} /></div>;

    return <img src={src} alt={file.name || "Attachment preview"} style={{ width: size, height: size, objectFit: "cover", borderRadius: 10, display: "block", border: `1px solid ${theme.border}`, flexShrink: 0 }} />;
  }

  function MessageAttachmentPreview({ src, name, theme }) {
    if (!src) return null;
    return (
      <div style={{ marginBottom: 8 }}>
        <img
          src={src}
          alt={name || "Attached image"}
          style={{ display: "block", width: "min(280px, 100%)", maxHeight: 280, objectFit: "cover", borderRadius: 12, border: `1px solid ${theme.border}` }}
        />
        {name && <div style={{ marginTop: 5, fontSize: 11, color: theme.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>}
      </div>
    );
  }

  function cleanVantMarkdown(source) {
    let text = String(source || "")
      .replace(/\r\n/g, "\n")
      .replace(/\\times/g, "×")
      .replace(/\\cdot/g, "·")
      .replace(/\\pm/g, "±")
      .replace(/\\square/g, "☐")
      .replace(/<br\s*\/?>/gi, " · ")
      .replace(/\\%/g, "%");

    // Defensive UI cleanup: Work Engine diagnostics remain internal.
    text = text.replace(
      /^\s*(?:\*\*VANT WORK ENGINE\*\*|VANT WORK ENGINE)\s*[\s\S]*?^---\s*\n?/im,
      ""
    );

    // Keep simple inline math readable without exposing raw LaTeX delimiters.
    text = text.replace(/\$([^$\n]+)\$/g, "$1");
    return text.trim();
  }

  function renderInlineMarkdown(text, theme, isDark, keyPrefix = "inline") {
    const tokens = [];
    const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(__[^_]+__)/g;
    let last = 0;
    let match;
    let index = 0;

    while ((match = pattern.exec(text)) !== null) {
      if (match.index > last) tokens.push(text.slice(last, match.index));
      const value = match[0];
      const key = `${keyPrefix}-${index++}`;

      if (match[2] && match[3]) {
        tokens.push(
          <a key={key} href={match[3]} target="_blank" rel="noreferrer"
            style={{ color: isDark ? "#bda7ff" : "#5b36b8", textDecoration: "underline" }}>
            {match[2]}
          </a>
        );
      } else if (value.startsWith("`")) {
        tokens.push(
          <code key={key} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "0.9em", padding: "2px 5px", borderRadius: 5, background: theme.surfaceStrong, border: `1px solid ${theme.border}` }}>
            {value.slice(1, -1)}
          </code>
        );
      } else if (value.startsWith("**")) {
        tokens.push(<strong key={key}>{value.slice(2, -2)}</strong>);
      } else if (value.startsWith("__")) {
        tokens.push(<strong key={key}>{value.slice(2, -2)}</strong>);
      } else {
        tokens.push(<em key={key}>{value.slice(1, -1)}</em>);
      }

      last = match.index + value.length;
    }

    if (last < text.length) tokens.push(text.slice(last));
    return tokens.length ? tokens : [text];
  }

  function VantMarkdown({ source, theme, isDark }) {
    const markdown = cleanVantMarkdown(source);
    if (!markdown) return null;

    const lines = markdown.split("\n");
    const blocks = [];
    let i = 0;
    let blockIndex = 0;

    const isTableSeparator = (line) => {
      const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
      return cells.length > 0 && cells.every((cell) => /^\s*:?-{3,}:?\s*$/.test(cell));
    };

    const splitTableRow = (line) =>
      line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());

    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (!trimmed) { i += 1; continue; }

      if (trimmed.startsWith("```")) {
        const language = trimmed.slice(3).trim();
        const codeLines = [];
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith("```")) {
          codeLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1;
        blocks.push(
          <pre key={`code-${blockIndex++}`} style={{ margin: "12px 0", padding: 14, overflowX: "auto", borderRadius: 10, background: isDark ? "rgba(0,0,0,.28)" : "rgba(15,15,35,.055)", border: `1px solid ${theme.border}`, fontFamily: "JetBrains Mono, monospace", fontSize: 12.5, lineHeight: 1.55 }}>
            {language && <div style={{ marginBottom: 8, color: theme.textFaint, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".06em" }}>{language}</div>}
            <code>{codeLines.join("\n")}</code>
          </pre>
        );
        continue;
      }

      if (i + 1 < lines.length && trimmed.includes("|") && isTableSeparator(lines[i + 1])) {
        const headers = splitTableRow(lines[i]);
        const rows = [];
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
          rows.push(splitTableRow(lines[i]));
          i += 1;
        }
        blocks.push(
          <div key={`table-${blockIndex++}`} style={{ overflowX: "auto", margin: "12px 0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360, fontSize: 13 }}>
              <thead><tr>{headers.map((cell, index) => <th key={index} style={{ textAlign: "left", padding: "9px 10px", borderBottom: `1px solid ${theme.borderStrong}`, fontWeight: 600, color: theme.text }}>{renderInlineMarkdown(cell, theme, isDark, `th-${blockIndex}-${index}`)}</th>)}</tr></thead>
              <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{headers.map((_, colIndex) => <td key={colIndex} style={{ padding: "9px 10px", borderBottom: `1px solid ${theme.border}`, verticalAlign: "top", color: theme.text }}>{renderInlineMarkdown(row[colIndex] || "", theme, isDark, `td-${blockIndex}-${rowIndex}-${colIndex}`)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        continue;
      }

      const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        const size = level === 1 ? 22 : level === 2 ? 19 : level === 3 ? 16 : 14.5;
        blocks.push(<div key={`heading-${blockIndex++}`} style={{ marginTop: blocks.length ? 18 : 0, marginBottom: 7, fontSize: size, lineHeight: 1.25, fontWeight: 600, color: theme.text }}>{renderInlineMarkdown(heading[2], theme, isDark, `heading-${blockIndex}`)}</div>);
        i += 1;
        continue;
      }

      if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) {
        blocks.push(<div key={`rule-${blockIndex++}`} style={{ height: 1, background: theme.border, margin: "14px 0" }} />);
        i += 1;
        continue;
      }

      const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
      const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (bullet || numbered) {
        const ordered = Boolean(numbered);
        const items = [];
        while (i < lines.length) {
          const current = lines[i].trim();
          const match = ordered ? current.match(/^\d+[.)]\s+(.+)$/) : current.match(/^[-*+]\s+(.+)$/);
          if (!match) break;
          items.push(match[1]);
          i += 1;
        }
        const ListTag = ordered ? "ol" : "ul";
        blocks.push(<ListTag key={`list-${blockIndex++}`} style={{ margin: "8px 0", paddingLeft: 22 }}>{items.map((item, index) => <li key={index} style={{ margin: "4px 0", paddingLeft: 3 }}>{renderInlineMarkdown(item, theme, isDark, `list-${blockIndex}-${index}`)}</li>)}</ListTag>);
        continue;
      }

      if (trimmed.startsWith(">")) {
        const quoteLines = [];
        while (i < lines.length && lines[i].trim().startsWith(">")) {
          quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
          i += 1;
        }
        blocks.push(<blockquote key={`quote-${blockIndex++}`} style={{ margin: "10px 0", padding: "8px 12px", borderLeft: `3px solid ${isDark ? "#9b7bea" : "#7651c8"}`, color: theme.textMuted, background: theme.surface }}>{quoteLines.map((quote, index) => <div key={index}>{renderInlineMarkdown(quote, theme, isDark, `quote-${blockIndex}-${index}`)}</div>)}</blockquote>);
        continue;
      }

      const paragraph = [trimmed];
      i += 1;
      while (i < lines.length && lines[i].trim()) {
        const next = lines[i].trim();
        if (/^#{1,6}\s+/.test(next) || /^```/.test(next) || /^[-*+]\s+/.test(next) || /^\d+[.)]\s+/.test(next) || next.startsWith(">")) break;
        if (i + 1 < lines.length && next.includes("|") && isTableSeparator(lines[i + 1])) break;
        paragraph.push(next);
        i += 1;
      }
      blocks.push(<p key={`p-${blockIndex++}`} style={{ margin: "8px 0", whiteSpace: "pre-wrap" }}>{paragraph.map((part, index) => <span key={index}>{index > 0 && " "}{renderInlineMarkdown(part, theme, isDark, `p-${blockIndex}-${index}`)}</span>)}</p>);
    }

    return <div style={{ overflowWrap: "anywhere" }}>{blocks}</div>;
  }

  function ChatMessageContent({ message, theme, isDark }) {
    const content = message?.content;
    if (typeof content === "string") return <VantMarkdown source={content} theme={theme} isDark={isDark} />;
    if (!Array.isArray(content)) return null;

    const imageParts = content.filter((part) => part?.type === "image_url" && part?.image_url?.url);
    const textParts = content.filter((part) => part?.type === "text" && !/\[VANT_ATTACHMENT_CONTEXT\][\s\S]*?\[\/VANT_ATTACHMENT_CONTEXT\]/.test(part?.text || ""));
    const text = textParts.map((part) => part?.text || "").filter(Boolean).join("\n");

    return (
      <>
        {imageParts.map((part, index) => <MessageAttachmentPreview key={`${index}-${part.image_url.url.slice(0, 24)}`} src={part.image_url.url} name={part?.name} theme={theme} />)}
        {text && <VantMarkdown source={text} theme={theme} isDark={isDark} />}
      </>
    );
  }


  function ComposerMenu({ theme, isDark, composerRef, composerOpen, setComposerOpen, setComposerNotice, fileInputRef, addFiles, takeScreenshot, composerAction, onGoToIntegrations, webSearch, setWebSearch }) {
    const itemStyle = { width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "none", background: "transparent", color: theme.text, cursor: "pointer", textAlign: "left", borderRadius: 10 };
    const iconBox = (color) => ({ width: 28, height: 28, borderRadius: 8, background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 });
    const sub = { marginLeft: "auto", color: theme.textFaint };
    return (
      <div ref={composerRef} style={{ position: "relative" }}>
        <button type="button" onClick={() => { setComposerOpen((v) => !v); setComposerNotice(""); }} title="Add to VANT" style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${composerOpen ? theme.borderStrong : theme.border}`, background: composerOpen ? theme.surfaceStrong : theme.surface, color: theme.textMuted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Plus size={19} />
        </button>
        {composerOpen && (
          <div className="v-fade" style={{ position: "absolute", bottom: 50, left: 0, width: 286, padding: 8, borderRadius: 16, background: theme.surfaceCard, border: `1px solid ${theme.borderStrong}`, boxShadow: isDark ? "0 18px 50px rgba(0,0,0,.45)" : "0 18px 50px rgba(15,15,35,.16)", zIndex: 30 }}>
            <button type="button" onClick={() => fileInputRef.current?.click()} style={itemStyle}>
              <span style={iconBox(acBg("violet"))}><Paperclip size={17} color={ac("violet", isDark)} /></span>
              <span><strong style={{ display: "block", fontSize: 13.5, fontWeight: 500 }}>Add files or photos</strong><span style={{ display: "block", fontSize: 11.5, color: theme.textFaint }}>PDF, Excel, CSV, Word, images</span></span>
              <span style={sub}>Ctrl+U</span>
            </button>
            <button type="button" onClick={takeScreenshot} style={itemStyle}>
              <span style={iconBox(acBg("cyan"))}><Camera size={17} color={ac("cyan", isDark)} /></span>
              <span style={{ fontSize: 13.5 }}>Take a screenshot</span>
            </button>
            <div style={{ height: 1, background: theme.border, margin: "6px 4px" }} />
            <button type="button" onClick={() => composerAction("Projects")} style={itemStyle}>
              <span style={iconBox(acBg("green"))}><FolderPlus size={17} color={ac("green", isDark)} /></span><span style={{ fontSize: 13.5 }}>Add to project</span><ChevronRight size={16} style={sub} />
            </button>
            <button type="button" onClick={() => composerAction("Skills")} style={itemStyle}>
              <span style={iconBox(acBg("violet"))}><Sparkles size={17} color={ac("violet", isDark)} /></span><span style={{ fontSize: 13.5 }}>Skills</span><ChevronRight size={16} style={sub} />
            </button>
            <button type="button" onClick={() => onGoToIntegrations?.()} style={itemStyle}>
              <span style={iconBox(acBg("amber"))}><Link2 size={17} color={ac("amber", isDark)} /></span><span style={{ fontSize: 13.5 }}>Add connector</span><ChevronRight size={16} style={sub} />
            </button>
            <button type="button" onClick={() => composerAction("Design system")} style={itemStyle}>
              <span style={iconBox(acBg("red"))}><Palette size={17} color={ac("red", isDark)} /></span><span style={{ fontSize: 13.5 }}>Design system</span><ChevronRight size={16} style={sub} />
            </button>
            <button type="button" onClick={() => composerAction("Plugins")} style={itemStyle}>
              <span style={iconBox(acBg("cyan"))}><Puzzle size={17} color={ac("cyan", isDark)} /></span><span style={{ fontSize: 13.5 }}>Add plugins</span><ChevronRight size={16} style={sub} />
            </button>
            <div style={{ height: 1, background: theme.border, margin: "6px 4px" }} />
            <button type="button" onClick={() => { setWebSearch((v) => !v); setComposerOpen(false); setComposerNotice(!webSearch ? "Web search mode selected. Live search wiring will be connected in the web/integration layer." : "Web search mode turned off."); }} style={itemStyle}>
              <span style={iconBox(acBg("cyan"))}><Globe size={17} color={ac("cyan", isDark)} /></span><span style={{ fontSize: 13.5 }}>Web search</span><span style={{ ...sub, color: webSearch ? ac("cyan", isDark) : theme.textFaint }}>{webSearch ? "✓" : ""}</span>
            </button>
          </div>
        )}
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.csv,.tsv,.xlsx,.xls,.doc,.docx,.txt,.md,.json,.xml,.html,.htm,.rtf,image/*" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} style={{ display: "none" }} />
      </div>
    );
  }

  function Composer({ theme, isDark, compact = false, attachments, composerNotice, input, setInput, loading, handleSubmit, composerRef, composerOpen, setComposerOpen, setComposerNotice, fileInputRef, addFiles, takeScreenshot, composerAction, onGoToIntegrations, webSearch, setWebSearch, removeAttachment }) {
    return (
      <div style={{ width: "100%", maxWidth: compact ? 920 : 760, margin: compact ? "0 auto" : "0 auto", boxSizing: "border-box" }}>
        {attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8, justifyContent: compact ? "flex-start" : "center" }}>
            {attachments.map((file, i) => {
              const image = file.type.startsWith("image/");
              return <div key={`${file.name}-${i}`} style={{ position: "relative", display: "flex", alignItems: "center", gap: 8, padding: 6, paddingRight: 28, borderRadius: 12, background: theme.surface, border: `1px solid ${theme.border}` }}>
                <AttachmentPreview file={file} theme={theme} isDark={isDark} size={56} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: theme.text }}>{file.name}</div>
                  <div style={{ marginTop: 2, fontSize: 10.5, color: theme.textFaint }}>{image ? "Image preview" : `${Math.max(1, Math.round(file.size / 1024))} KB`}</div>
                </div>
                <button type="button" onClick={() => removeAttachment(i)} aria-label={`Remove ${file.name}`} style={{ position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: 999, border: `1px solid ${theme.border}`, background: theme.surfaceCard, color: theme.textFaint, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><X size={12} /></button>
              </div>;
            })}
          </div>
        )}
        {composerNotice && <div style={{ marginBottom: 8, fontSize: 11.5, color: theme.textFaint, textAlign: compact ? "left" : "center" }}>{composerNotice}</div>}
        <form onSubmit={handleSubmit} style={{ display: "flex", alignItems: "flex-end", gap: 8, padding: 7, borderRadius: 18, background: theme.inputBg, border: `1px solid ${theme.borderStrong}`, boxShadow: isDark ? "0 8px 30px rgba(0,0,0,.16)" : "0 8px 30px rgba(15,15,35,.06)" }}>
          <ComposerMenu
            theme={theme}
            isDark={isDark}
            composerRef={composerRef}
            composerOpen={composerOpen}
            setComposerOpen={setComposerOpen}
            setComposerNotice={setComposerNotice}
            fileInputRef={fileInputRef}
            addFiles={addFiles}
            takeScreenshot={takeScreenshot}
            composerAction={composerAction}
            onGoToIntegrations={onGoToIntegrations}
            webSearch={webSearch}
            setWebSearch={setWebSearch}
          />
          <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }} placeholder="Ask VANT to do something…" disabled={loading} autoFocus rows={1} style={{ color: theme.text, fontSize: 14.5, outline: "none", textAlign: "left", direction: "ltr", lineHeight: 1.4, flex: 1, minHeight: 42, maxHeight: 130, resize: "none", border: "none", background: "transparent", padding: "11px 8px", borderRadius: 12, boxSizing: "border-box" }} />
          <button type="submit" disabled={loading || !input.trim()} title="Send" style={{ width: 42, height: 42, borderRadius: 12, background: acBg("violet"), border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: loading || !input.trim() ? 0.45 : 1 }}><Send size={17} color={ac("violet", isDark)} /></button>
        </form>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, padding: "0 4px", fontSize: 10.5, color: theme.textFaint }}>
          <span>{webSearch ? "WEB SEARCH MODE" : attachments.length ? `${attachments.length} attachment${attachments.length === 1 ? "" : "s"} ready` : "VANT WORK MODE"}</span>
          <span>Enter to send · Shift+Enter for new line</span>
        </div>
      </div>
    );
  }

function ChatPage({
  theme,
  isDark,
  onGoToIntegrations,
  conversations,
  activeConversationId,
  onNewConversation,
  onCreateConversation,
  onSelectConversation,
  onSaveConversation,
  onTogglePinConversation,
  onDeleteConversation,
  projectId = null,
  projectName = "",
  projectMode = false,
  onBackToProject = null,
}) {
  const activeConversation = conversations.find((item) => item.id === activeConversationId) || null;
  const [started, setStarted] = useState(Boolean(activeConversation?.messages?.length));
  const [messages, setMessages] = useState(activeConversation?.messages || []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [composerNotice, setComposerNotice] = useState("");
  const scrollRef = useRef(null);
  const messagesRef = useRef(activeConversation?.messages || []);
  const sessionConversationIdRef = useRef(activeConversationId);
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [editingMessageIndex, setEditingMessageIndex] = useState(null);
  const [responseFeedback, setResponseFeedback] = useState({});
  const [responsePanel, setResponsePanel] = useState(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (sessionConversationIdRef.current === activeConversationId) return;
    sessionConversationIdRef.current = activeConversationId;
    const nextMessages = activeConversation?.messages || [];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setStarted(nextMessages.length > 0);
    setInput("");
    setAttachments([]);
    setComposerNotice("");
    setWebSearch(false);
  }, [activeConversationId]);

  useEffect(() => {
    function close(e) {
      if (composerRef.current && !composerRef.current.contains(e.target)) setComposerOpen(false);
      if (!e.target.closest?.("[data-vant-response-actions]")) setResponsePanel(null);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    setAttachments((prev) => [...prev, ...incoming].slice(0, 8));
    setComposerNotice(`${Math.min(incoming.length, 8)} file${incoming.length === 1 ? "" : "s"} added to this work session.`);
    setComposerOpen(false);
  }

  async function takeScreenshot() {
    setComposerOpen(false);
    setComposerNotice("");
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("unsupported");
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(settings.width || 1440, 1920);
      canvas.height = Math.min(settings.height || 900, 1080);
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      track.stop();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (!blob) throw new Error("capture_failed");
      const file = new File([blob], `vant-screenshot-${Date.now()}.jpg`, { type: "image/jpeg" });
      setAttachments((prev) => [...prev, file].slice(0, 8));
      setComposerNotice("Screenshot captured and added to this work session.");
    } catch {
      setComposerNotice("Screenshot capture was cancelled or isn't available in this browser.");
    }
  }

  function removeAttachment(index) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function composerAction(label) {
    setComposerNotice(`${label} is being prepared as a VANT capability. The interface is ready; its backend connection will be wired in the next capability layer.`);
    setComposerOpen(false);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function prepareImageForModel(file) {
    const rawUrl = await fileToDataUrl(file);
    const img = new Image();
    img.src = rawUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
    const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    return { dataUrl, width, height };
  }

  async function buildUserContent(text) {
    const parts = [];
    const cleanText = String(text || "").trim();
    if (cleanText) parts.push({ type: "text", text: cleanText });

    for (const file of attachments) {
      const meta = `Attachment: ${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`;
      const isImage =
        file.type?.startsWith("image/") ||
        /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(file.name || "");

      if (isImage) {
        try {
          const prepared = await prepareImageForModel(file);
          parts.push({
            type: "text",
            text: `${meta}. Inspect the attached image and use it as evidence for the user's request.`,
          });
          parts.push({
            type: "image_url",
            image_url: { url: prepared.dataUrl },
          });
        } catch {
          parts.push({
            type: "text",
            text: `${meta}. The image could not be prepared for analysis.`,
          });
        }
        continue;
      }

      try {
        const parsed = await parseAttachment(file, { maxChars: 40000 });
        if (parsed?.text) {
          parts.push({
            type: "text",
            text: `${meta}\n[VANT_ATTACHMENT_CONTEXT]\nTYPE: ${parsed.kind}\n${parsed.text}\n[/VANT_ATTACHMENT_CONTEXT]`,
          });
        } else {
          parts.push({
            type: "text",
            text: `${meta}\n[attachment content could not be extracted in the browser]`,
          });
        }
      } catch (error) {
        parts.push({
          type: "text",
          text: `${meta}\n[attachment parsing failed: ${error?.message || "unknown parser error"}]`,
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

  function displayText(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content.filter((p) => p?.type === "text").map((p) => p.text || "").join("\n");
    }
    return "";
  }

async function send(text, options = {}) {
  const cleanText = text.trim();

  if ((!cleanText && attachments.length === 0) || loading) {
    return;
  }

  setStarted(true);
  setInput("");
  setLoading(true);
  setComposerNotice("");

  try {
    /*
     * ---------------------------------------------------------
     * 1. Build the user's multimodal message
     * ---------------------------------------------------------
     */
    const userContent = await buildUserContent(cleanText);

    const userMessage = {
      role: "user",
      content: userContent,
    };

    const baseMessages = Array.isArray(options.baseMessages) ? options.baseMessages : messages;
    const next = [
      ...baseMessages,
      userMessage,
    ];

    /*
     * ---------------------------------------------------------
     * 2. Let the VANT Work Engine understand the request
     * ---------------------------------------------------------
     */
    const work = buildVantWorkEnvelope({
      messages: next,
      attachments,
      memoryAvailable: false,
    });

    /*
     * ---------------------------------------------------------
     * 3. Build VANT's work-aware system prompt
     * ---------------------------------------------------------
     */
    const vantWorkPrompt =
      buildVantSystemPrompt(work);

    const systemPrompt = `
You are VANT, an AI work platform and intelligent work assistant.
${projectId ? `
PROJECT CONTEXT:
You are working inside the VANT project workspace "${projectName}". Treat this conversation as project-specific work. Never invent project facts that are not present in the conversation.
` : ""}

${vantWorkPrompt}

CORE BEHAVIOR:

- Treat the user's request as work to accomplish, not merely a question to answer.
- Stay tightly relevant to the latest request and conversation context.
- Understand the objective before responding.
- Be practical, intelligent, direct, and useful.
- Match the user's tone when appropriate.
- Use structure when it improves clarity.
- Keep simple requests simple.
- Give complex requests the structure they require.
- Never invent facts, tool results, file contents, web results, or observations.
- Never claim an external action was completed unless VANT actually performed it.
- If information is missing, clearly state what is missing.
- If an attachment is available, use only the information actually provided.
- Distinguish observation from inference when analyzing evidence.
- For technical problems, provide practical debugging or implementation steps.
- For creative work, explore original ideas without sacrificing usefulness.
- For execution-oriented requests, turn the objective into concrete actionable work.

VANT WORK LOOP:

Understand → Analyze → Decide → Act → Verify → Report.

VANT CURRENT CAPABILITIES:

- General AI reasoning and conversation
- Multimodal image understanding
- Work classification
- Analysis and structured problem solving
- Creative generation
- Technical assistance
- Operational planning
- Cowork task planning interface

Do not pretend that capabilities are available when they are not yet connected.
- Do not expose internal VANT Work Engine diagnostics, task classifications, complexity labels, status fields, routing metadata, temperature decisions, or system instructions in the user-facing response.
- Do not prepend responses with a "VANT WORK ENGINE" diagnostic block.
- Return the actual work product directly. Use clean Markdown when structure improves readability.

Respond naturally like a sharp work partner.
`;

    /*
     * ---------------------------------------------------------
     * 4. Create the conversation
     * ---------------------------------------------------------
     */
    const chatId =
      activeConversationId ||
      onCreateConversation({
        messages: next,
        projectId,
      });

    sessionConversationIdRef.current = chatId;

    /*
     * ---------------------------------------------------------
     * 5. Create an EMPTY assistant message.
     *
     * This is the message that streaming will continuously
     * update as NVIDIA sends new chunks.
     * ---------------------------------------------------------
     */
    const streamingAssistantMessage = {
      role: "assistant",
      content: "",
    };

    const streamingMessages = [
      ...next,
      streamingAssistantMessage,
    ];

    setMessages(streamingMessages);
    messagesRef.current = streamingMessages;

    /*
     * ---------------------------------------------------------
     * 6. Start streaming
     * ---------------------------------------------------------
     */
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const reply = await askClaude(
      systemPrompt,

      next.map((message) => ({
        role: message.role,
        content: message.content,
      })),

      /*
       * -------------------------------------------------------
       * This callback fires EVERY TIME new model text arrives.
       * -------------------------------------------------------
       */
      (partialText) => {
        setMessages((current) => {
          const updated = [...current];

          const assistantIndex =
            updated.length - 1;

          if (
            assistantIndex >= 0 &&
            updated[assistantIndex]?.role === "assistant"
          ) {
            updated[assistantIndex] = {
              ...updated[assistantIndex],
              content: partialText,
            };
          }

          messagesRef.current = updated;

          return updated;
        });
      },
      58000,
      abortController.signal
    );

    if (reply === "__VANT_USER_STOPPED__") {
      const stoppedMessages = [...next];
      setMessages(stoppedMessages);
      messagesRef.current = stoppedMessages;
      onSaveConversation(chatId, stoppedMessages, projectId);
      setAttachments([]);
      return;
    }

    /*
     * ---------------------------------------------------------
     * 7. Finalize the assistant message
     * ---------------------------------------------------------
     */
    const completedMessages = [
      ...next,
      {
        role: "assistant",
        content: reply,
      },
    ];

    setMessages(completedMessages);
    messagesRef.current = completedMessages;

    /*
     * Save ONLY the completed conversation.
     */
    onSaveConversation(
      chatId,
      completedMessages,
      projectId
    );

    /*
     * Attachments have now been consumed by this request.
     */
    setAttachments([]);
  } catch (err) {
    console.error(
      "VANT Chat send error:",
      err
    );

    const errorMessage = {
      role: "assistant",
      content:
        "I couldn't prepare that request. Please try again.",
    };

    setMessages((current) => [
      ...current,
      errorMessage,
    ]);

    messagesRef.current = [
      ...messagesRef.current,
      errorMessage,
    ];
  } finally {
    abortControllerRef.current = null;
    setLoading(false);
  }
}
  
  async function copyMessage(message) {
    const text = displayText(message?.content);
    if (!text) {
      setComposerNotice("There is no response text to copy.");
      return false;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setComposerNotice("Response copied to clipboard.");
        return true;
      }
    } catch {}
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(area);
      setComposerNotice(copied ? "Response copied to clipboard." : "Could not copy this response.");
      return copied;
    } catch {
      setComposerNotice("Could not copy this response in this browser.");
      return false;
    }
  }

  function editUserMessage(index) {
    const message = messages[index];
    const text = displayText(message?.content);
    if (!text) return;
    setMessages(messages.slice(0, index));
    messagesRef.current = messages.slice(0, index);
    setInput(text);
    setEditingMessageIndex(index);
    setStarted(true);
    setComposerNotice("Message loaded into the composer. Edit it and send again.");
  }

  async function regenerateAssistant(index) {
    if (loading) return;
    const previousUserIndex = [...messages.slice(0, index)]
      .map((m, i) => ({ m, i }))
      .reverse()
      .find(({ m }) => m.role === "user")?.i;
    if (previousUserIndex == null) {
      setComposerNotice("VANT could not find the request for this response.");
      return;
    }
    const prompt = displayText(messages[previousUserIndex]?.content);
    if (!prompt) {
      setComposerNotice("VANT could not recover the original request.");
      return;
    }
    // Preserve every earlier turn, remove the selected request/response,
    // then let send() append the request and generate a fresh answer.
    const baseMessages = messages.slice(0, previousUserIndex);
    setResponsePanel(null);
    setMessages(baseMessages);
    messagesRef.current = baseMessages;
    setComposerNotice("Regenerating the response…");
    await send(prompt, { baseMessages });
  }

  function reactToResponse(index, reaction) {
    setResponseFeedback((current) => {
      const next = { ...current };
      if (next[index] === reaction) delete next[index];
      else next[index] = reaction;
      return next;
    });
    setResponsePanel(null);
    setComposerNotice(reaction === "up" ? "Response marked helpful." : "Response marked not helpful.");
  }

  function reportBadResponse(index, reason) {
    setResponseFeedback((current) => ({ ...current, [index]: `bad:${reason}` }));
    setResponsePanel(null);
    setComposerNotice(`Feedback recorded: ${reason}.`);
  }

  function handleResponseAction(index, action) {
    const message = messages[index];
    if (!message) return;

    if (action === "copy") {
      copyMessage(message);
      setResponsePanel(null);
      return;
    }

    if (action === "regenerate") {
      regenerateAssistant(index);
      return;
    }

    if (action === "use") {
      const text = displayText(message.content);
      if (!text) {
        setResponsePanel(null);
        setComposerNotice("This response has no text to use.");
        return;
      }
      setInput(text);
      setResponsePanel(null);
      setComposerOpen(false);
      setComposerNotice("Response loaded into the composer. Edit it or send it to VANT.");
      return;
    }

    if (action === "report") {
      setResponsePanel({ index, type: "bad" });
    }
  }

  function stopGeneration() {
    if (!loading) return;
    abortControllerRef.current?.abort();
    setComposerNotice("Generation stopped.");
  }

  function handleSubmit(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setEditingMessageIndex(null);
    send(text);
  }

  const workCards = [
    { title: "Ship smarter", icon: Truck, accentKey: "cyan", prompts: ["Analyze this shipment delay and propose next actions", "Compare actual vs volumetric weight for this carton"] },
    { title: "Write fast", icon: FileText, accentKey: "violet", prompts: ["Draft a firm but polite vendor follow-up email", "Rewrite this update for executives in 5 bullets"] },
    { title: "Decide clearly", icon: Target, accentKey: "amber", prompts: ["Help me think through this decision with tradeoffs", "Turn this messy note into a 3-step action plan"] },
  ];

  function startWork(prompt) {
    if (loading) return;
    setInput("");
    setComposerNotice("");
    send(prompt);
  }


  if (!started) {
    return (
      <div style={{ height: "100%", display: "flex", minWidth: 0, overflow: "hidden" }}>
        <HistoryPanel theme={theme} isDark={isDark} conversations={conversations} activeConversationId={activeConversationId} onNewConversation={onNewConversation} onSelectConversation={onSelectConversation} onTogglePinConversation={onTogglePinConversation} onDeleteConversation={onDeleteConversation} projectMode={projectMode} projectName={projectName} onBackToProject={onBackToProject} />

        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden" }}>
          {projectMode && <div style={{ padding: "10px 24px", borderBottom: `1px solid ${theme.border}`, display: "flex", alignItems: "center", gap: 9, color: theme.textMuted, fontSize: 12.5 }}><FolderKanban size={15} color={ac("violet", isDark)} /><span style={{ fontWeight: 600, color: theme.text }}>{projectName}</span><span>· Project Chat</span><button type="button" onClick={onBackToProject} style={{ marginLeft: "auto", border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textMuted, borderRadius: 9, padding: "6px 9px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}><ArrowLeft size={13} /> Back to Project</button></div>}
          <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "24px 24px 36px", boxSizing: "border-box", overflow: "auto" }}>
            <div style={{ width: "min(1080px, 100%)", maxWidth: 1080, margin: "0 auto" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 999, background: acBg("violet"), border: `1px solid ${theme.border}`, color: ac("violet", isDark), fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, letterSpacing: 1.3, marginBottom: 26 }}>
                <Sparkles size={14} /> VANT · WORK MODE
              </div>
              <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 42, fontWeight: 500, margin: "0 0 12px", color: theme.text }}>What are we working on?</h1>
              <p style={{ color: theme.textMuted, fontSize: 16, margin: "0 auto 34px", maxWidth: 650, lineHeight: 1.55 }}>
                Drop a task, a messy problem, a spreadsheet, or a half-baked idea. VANT will understand the objective, cut the fluff, and push the work forward — not just answer.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, width: "100%", maxWidth: 1080, margin: "0 auto" }}>
                {workCards.map((card) => {
                  const Icon = card.icon;
                  const accent = ac(card.accentKey, isDark);
                  return (
                    <div key={card.title} style={{ textAlign: "left", padding: 16, borderRadius: 18, background: theme.surface, border: `1px solid ${theme.border}`, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
                        <div style={{ width: 45, height: 45, borderRadius: 12, background: acBg(card.accentKey), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icon size={21} color={accent} />
                        </div>
                        <span style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>{card.title}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                        {card.prompts.map((prompt) => (
                          <button key={prompt} type="button" disabled={loading} onClick={() => startWork(prompt)}
                            style={{ width: "100%", minHeight: 70, textAlign: "left", padding: "12px 14px", borderRadius: 13, background: theme.surfaceStrong, border: `1px solid ${theme.border}`, color: theme.text, fontSize: 13.5, lineHeight: 1.35, cursor: loading ? "default" : "pointer", opacity: loading ? 0.55 : 1 }}>
                            {prompt}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flexWrap: "wrap", gap: 14, marginTop: 25, color: theme.textFaint, fontSize: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Sparkles size={14} /> Thinks before it talks</span>
                <span>·</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Wrench size={14} /> Built for real work</span>
                <span>·</span>
                <span>⌘ / Ctrl + N new chat</span>
              </div>
            </div>
          </div>

          <div style={{ flex: "0 0 auto", width: "100%", boxSizing: "border-box", padding: "0 24px 24px", background: theme.bg }}>
            <div style={{ width: "min(760px, 100%)", maxWidth: 760, margin: "0 auto" }}>
              <Composer theme={theme} isDark={isDark} attachments={attachments} composerNotice={composerNotice} input={input} setInput={setInput} loading={loading} handleSubmit={handleSubmit} composerRef={composerRef} composerOpen={composerOpen} setComposerOpen={setComposerOpen} setComposerNotice={setComposerNotice} fileInputRef={fileInputRef} addFiles={addFiles} takeScreenshot={takeScreenshot} composerAction={composerAction} onGoToIntegrations={onGoToIntegrations} webSearch={webSearch} setWebSearch={setWebSearch} removeAttachment={removeAttachment} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", minWidth: 0 }}>
      <HistoryPanel theme={theme} isDark={isDark} conversations={conversations} activeConversationId={activeConversationId} onNewConversation={onNewConversation} onSelectConversation={onSelectConversation} onTogglePinConversation={onTogglePinConversation} onDeleteConversation={onDeleteConversation} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", borderBottom: `1px solid ${theme.border}` }}>
        {projectMode && <button type="button" onClick={onBackToProject} style={{ border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textMuted, borderRadius: 9, padding: "6px 9px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5 }}><ArrowLeft size={13} /> Project</button>}
        <span style={{ fontSize: 15, fontWeight: 500, color: theme.text }}>{projectMode ? `VANT · ${projectName}` : "VANT · Work Session"}</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: ac("green", isDark), fontSize: 13 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: ac("green", isDark) }} />Live</span>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} className="v-fade" style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: "78%", padding: "12px 16px", borderRadius: 14, fontSize: 14.5, lineHeight: 1.55, background: m.role === "user" ? theme.surfaceStrong : acBg("violet"), color: m.role === "user" ? theme.text : (isDark ? "#e9e0ff" : "#3b1f6b") }}><ChatMessageContent message={m} theme={theme} isDark={isDark} /></div>
            {m.content && (
              <div data-vant-response-actions="true" style={{ position: "relative", marginTop: 6, maxWidth: "78%", width: "fit-content" }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5, color: theme.textFaint }}>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9.5, letterSpacing: 1.1, marginRight: 2, opacity: 0.9 }}>VANT RESPONSE</span>
                  <button type="button" onClick={() => copyMessage(m)} title="Copy response" style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textMuted, cursor: "pointer", padding: "5px 8px", borderRadius: 8, fontSize: 11.5 }}><Copy size={13} />Copy</button>
                  {!loading && i > 0 && <button type="button" onClick={() => regenerateAssistant(i)} title="Regenerate response" style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textMuted, cursor: "pointer", padding: "5px 8px", borderRadius: 8, fontSize: 11.5 }}><RefreshCw size={13} />Regenerate</button>}
                  <button type="button" onClick={() => setResponsePanel((current) => current?.index === i && current.type === "react" ? null : { index: i, type: "react" })} title="React to response" style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${responseFeedback[i] ? ac("violet", isDark) : theme.border}`, background: responseFeedback[i] ? acBg("violet") : theme.surface, color: responseFeedback[i] ? ac("violet", isDark) : theme.textMuted, cursor: "pointer", padding: "5px 8px", borderRadius: 8, fontSize: 11.5 }}><ThumbsUp size={13} />React</button>
                  <button type="button" onClick={() => setResponsePanel((current) => current?.index === i && current.type === "bad" ? null : { index: i, type: "bad" })} title="Report a bad response" style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textMuted, cursor: "pointer", padding: "5px 8px", borderRadius: 8, fontSize: 11.5 }}><Flag size={13} />Bad Response</button>
                  <button type="button" onClick={() => setResponsePanel((current) => current?.index === i && current.type === "more" ? null : { index: i, type: "more" })} title="More response actions" style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textMuted, cursor: "pointer", padding: "5px 8px", borderRadius: 8, fontSize: 11.5 }}><MoreHorizontal size={14} />More Action</button>
                </div>
                {responsePanel?.index === i && responsePanel.type === "react" && (
                  <div className="v-fade" style={{ display: "flex", gap: 6, marginTop: 7, padding: 7, borderRadius: 11, background: theme.surfaceCard, border: `1px solid ${theme.borderStrong}`, boxShadow: isDark ? "0 12px 30px rgba(0,0,0,.28)" : "0 12px 30px rgba(15,15,35,.10)" }}>
                    <button type="button" onClick={() => reactToResponse(i, "up")} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${responseFeedback[i] === "up" ? ac("green", isDark) : theme.border}`, background: responseFeedback[i] === "up" ? acBg("green") : theme.surface, color: responseFeedback[i] === "up" ? ac("green", isDark) : theme.textMuted, borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 11.5 }}><ThumbsUp size={13} />Helpful</button>
                    <button type="button" onClick={() => reactToResponse(i, "down")} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${responseFeedback[i] === "down" ? ac("red", isDark) : theme.border}`, background: responseFeedback[i] === "down" ? acBg("red") : theme.surface, color: responseFeedback[i] === "down" ? ac("red", isDark) : theme.textMuted, borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 11.5 }}><ThumbsDown size={13} />Not helpful</button>
                  </div>
                )}
                {responsePanel?.index === i && responsePanel.type === "bad" && (
                  <div className="v-fade" style={{ marginTop: 7, padding: 10, borderRadius: 11, background: theme.surfaceCard, border: `1px solid ${theme.borderStrong}`, boxShadow: isDark ? "0 12px 30px rgba(0,0,0,.28)" : "0 12px 30px rgba(15,15,35,.10)" }}>
                    <div style={{ fontSize: 11.5, color: theme.text, marginBottom: 7 }}>What was wrong with this response?</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {["Incorrect", "Not relevant", "Too long", "Missing action"].map((reason) => <button key={reason} type="button" onClick={() => reportBadResponse(i, reason)} style={{ border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textMuted, borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 11.5 }}>{reason}</button>)}
                    </div>
                  </div>
                )}
                {responsePanel?.index === i && responsePanel.type === "more" && (
                  <div className="v-fade" style={{ display: "flex", flexDirection: "column", minWidth: 210, position: "absolute", left: 0, bottom: 35, zIndex: 50, padding: 6, borderRadius: 11, background: theme.surfaceCard, border: `1px solid ${theme.borderStrong}`, boxShadow: isDark ? "0 14px 36px rgba(0,0,0,.35)" : "0 14px 36px rgba(15,15,35,.12)" }}>
                    <button type="button" onClick={() => handleResponseAction(i, "copy")} style={{ border: "none", background: "transparent", color: theme.text, textAlign: "left", borderRadius: 7, padding: "8px 9px", cursor: "pointer", fontSize: 12 }}>Copy response</button>
                    {!loading && i > 0 && <button type="button" onClick={() => handleResponseAction(i, "regenerate")} style={{ border: "none", background: "transparent", color: theme.text, textAlign: "left", borderRadius: 7, padding: "8px 9px", cursor: "pointer", fontSize: 12 }}>Regenerate response</button>}
                    <button type="button" onClick={() => handleResponseAction(i, "use")} style={{ border: "none", background: "transparent", color: theme.text, textAlign: "left", borderRadius: 7, padding: "8px 9px", cursor: "pointer", fontSize: 12 }}>Use as composer input</button>
                    <button type="button" onClick={() => handleResponseAction(i, "report")} style={{ border: "none", background: "transparent", color: theme.text, textAlign: "left", borderRadius: 7, padding: "8px 9px", cursor: "pointer", fontSize: 12 }}>Report response</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", gap: 8 }}><div style={{ padding: "12px 16px", borderRadius: 14, background: acBg("violet"), display: "flex", gap: 4 }}>{[0, 1, 2].map((i) => <span key={i} className="v-pulse" style={{ width: 6, height: 6, borderRadius: 999, background: ac("violet", isDark), animationDelay: `${i * 0.15}s` }} />)}</div><button type="button" onClick={stopGeneration} title="Stop generation" style={{ width: 32, height: 32, borderRadius: 9, border: `1px solid ${theme.border}`, background: theme.surface, color: theme.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Square size={12} fill="currentColor" /></button></div>}
      </div>
      <div style={{ padding: "12px 18px 18px", borderTop: `1px solid ${theme.border}` }}><Composer compact theme={theme} isDark={isDark} attachments={attachments} composerNotice={composerNotice} input={input} setInput={setInput} loading={loading} handleSubmit={handleSubmit} composerRef={composerRef} composerOpen={composerOpen} setComposerOpen={setComposerOpen} setComposerNotice={setComposerNotice} fileInputRef={fileInputRef} addFiles={addFiles} takeScreenshot={takeScreenshot} composerAction={composerAction} onGoToIntegrations={onGoToIntegrations} webSearch={webSearch} setWebSearch={setWebSearch} removeAttachment={removeAttachment} /></div>
      </div>
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

const FREIGHT_ZONES = [
  { label: "Local", rate: 0.8 },
  { label: "Regional", rate: 1.4 },
  { label: "National", rate: 2.2 },
  { label: "International", rate: 4.5 },
];

function FreightCostTool({ onBack, theme, isDark }) {
  const [weight, setWeight] = useState("");
  const [zoneIdx, setZoneIdx] = useState(0);
  const [fuelSurcharge, setFuelSurcharge] = useState("12");
  const [handlingFee, setHandlingFee] = useState("0");
  const cyan = ac("cyan", isDark);

  const fieldStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, background: theme.inputBg, border: `1px solid ${theme.borderStrong}`, color: theme.text, fontSize: 14.5, outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 12.5, color: theme.textMuted, marginBottom: 6, display: "block" };

  const W = parseFloat(weight) || 0;
  const zone = FREIGHT_ZONES[zoneIdx];
  const surchargePct = parseFloat(fuelSurcharge) || 0;
  const handling = parseFloat(handlingFee) || 0;
  const base = W * zone.rate;
  const surcharge = base * (surchargePct / 100);
  const total = base + surcharge + handling;
  const hasInputs = W > 0;

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <BackBar title="Freight Cost Calculator" accentKey="cyan" isDark={isDark} theme={theme} onBack={onBack} />
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 500, margin: "0 0 6px", color: theme.text }}>Estimate the shipping cost.</h1>
      <p style={{ color: theme.textMuted, fontSize: 14.5, margin: "0 0 24px" }}>A rough estimate using zone rate, fuel surcharge, and handling fee. Swap in your real carrier rates when you have them.</p>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Chargeable weight (kg)</label>
        <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="0" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Zone</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {FREIGHT_ZONES.map((z, i) => (
            <button key={z.label} onClick={() => setZoneIdx(i)}
              style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer", border: `1px solid ${zoneIdx === i ? cyan : theme.borderStrong}`, background: zoneIdx === i ? acBg("cyan") : theme.surface, color: zoneIdx === i ? cyan : theme.textMuted }}>
              {z.label} (${z.rate.toFixed(2)}/kg)
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <div><label style={labelStyle}>Fuel surcharge (%)</label><input value={fuelSurcharge} onChange={(e) => setFuelSurcharge(e.target.value)} type="number" min="0" style={fieldStyle} /></div>
        <div><label style={labelStyle}>Handling fee ($)</label><input value={handlingFee} onChange={(e) => setHandlingFee(e.target.value)} type="number" min="0" style={fieldStyle} /></div>
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.surfaceCard, padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: hasInputs ? 18 : 0 }}>
          <div><p style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 4px" }}>Base cost</p><p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: theme.text }}>${base.toFixed(2)}</p></div>
          <div><p style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 4px" }}>Fuel surcharge</p><p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: theme.text }}>${surcharge.toFixed(2)}</p></div>
        </div>
        {hasInputs && (
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 18 }}>
            <p style={{ fontSize: 12, color: cyan, margin: "0 0 4px", fontFamily: "JetBrains Mono, monospace", letterSpacing: 1 }}>ESTIMATED TOTAL</p>
            <p style={{ fontSize: 30, fontWeight: 600, margin: 0, color: cyan }}>${total.toFixed(2)}</p>
          </div>
        )}
      </div>
      <p style={{ color: theme.textFaint, fontSize: 12, marginTop: 14 }}>Formula: total = (weight × zone rate) + fuel surcharge + handling fee. Zone rates here are placeholders, not real carrier pricing.</p>
    </div>
  );
}

const LOAD_UNITS = [
  { label: "20ft Container", volumeM3: 33.2 },
  { label: "40ft Container", volumeM3: 67.7 },
  { label: "40ft High Cube", volumeM3: 76.3 },
  { label: "Standard Pallet", volumeM3: 2.16 },
];

function LoadOptimizerTool({ onBack, theme, isDark }) {
  const [unitIdx, setUnitIdx] = useState(0);
  const [itemL, setItemL] = useState("");
  const [itemW, setItemW] = useState("");
  const [itemH, setItemH] = useState("");
  const [qty, setQty] = useState("");
  const [efficiency, setEfficiency] = useState("75");
  const violet = ac("violet", isDark);

  const fieldStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, background: theme.inputBg, border: `1px solid ${theme.borderStrong}`, color: theme.text, fontSize: 14.5, outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 12.5, color: theme.textMuted, marginBottom: 6, display: "block" };

  const unit = LOAD_UNITS[unitIdx];
  const L = parseFloat(itemL) || 0, W = parseFloat(itemW) || 0, H = parseFloat(itemH) || 0, Q = parseFloat(qty) || 0;
  const eff = Math.min(100, Math.max(1, parseFloat(efficiency) || 75)) / 100;

  const itemVolumeM3 = (L * W * H) / 1000000;
  const usableVolume = unit.volumeM3 * eff;
  const itemsPerUnit = itemVolumeM3 > 0 ? Math.floor(usableVolume / itemVolumeM3) : 0;
  const unitsNeeded = Q > 0 && itemsPerUnit > 0 ? Math.ceil(Q / itemsPerUnit) : 0;
  const hasInputs = L > 0 && W > 0 && H > 0 && Q > 0;

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <BackBar title="Load Optimizer" accentKey="violet" isDark={isDark} theme={theme} onBack={onBack} />
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 500, margin: "0 0 6px", color: theme.text }}>How much fits?</h1>
      <p style={{ color: theme.textMuted, fontSize: 14.5, margin: "0 0 24px" }}>Estimate how many units fit per container or pallet, and how many you'll need for a full shipment.</p>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Container / pallet type</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {LOAD_UNITS.map((u, i) => (
            <button key={u.label} onClick={() => setUnitIdx(i)}
              style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer", border: `1px solid ${unitIdx === i ? violet : theme.borderStrong}`, background: unitIdx === i ? acBg("violet") : theme.surface, color: unitIdx === i ? violet : theme.textMuted }}>
              {u.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div><label style={labelStyle}>Item length (cm)</label><input value={itemL} onChange={(e) => setItemL(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="0" /></div>
        <div><label style={labelStyle}>Item width (cm)</label><input value={itemW} onChange={(e) => setItemW(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="0" /></div>
        <div><label style={labelStyle}>Item height (cm)</label><input value={itemH} onChange={(e) => setItemH(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="0" /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <div><label style={labelStyle}>Total quantity to ship</label><input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="0" /></div>
        <div><label style={labelStyle}>Assumed packing efficiency (%)</label><input value={efficiency} onChange={(e) => setEfficiency(e.target.value)} type="number" min="1" max="100" style={fieldStyle} /></div>
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.surfaceCard, padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: hasInputs ? 18 : 0 }}>
          <div><p style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 4px" }}>Items per {unit.label}</p><p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: theme.text }}>{itemsPerUnit}</p></div>
          <div><p style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 4px" }}>Item volume</p><p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: theme.text }}>{itemVolumeM3.toFixed(4)} m³</p></div>
        </div>
        {hasInputs && (
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 18 }}>
            <p style={{ fontSize: 12, color: violet, margin: "0 0 4px", fontFamily: "JetBrains Mono, monospace", letterSpacing: 1 }}>UNITS NEEDED</p>
            <p style={{ fontSize: 30, fontWeight: 600, margin: 0, color: violet }}>{unitsNeeded} × {unit.label}</p>
          </div>
        )}
      </div>
      <p style={{ color: theme.textFaint, fontSize: 12, marginTop: 14 }}>Volume-based math only — it doesn't account for weight limits, stacking rules, or irregular shapes. Treat it as a starting estimate.</p>
    </div>
  );
}

const CONVERSION_GROUPS = [
  { label: "Weight", units: [{ label: "kg", toBase: 1 }, { label: "lb", toBase: 0.453592 }, { label: "g", toBase: 0.001 }, { label: "oz", toBase: 0.0283495 }] },
  { label: "Length", units: [{ label: "cm", toBase: 1 }, { label: "in", toBase: 2.54 }, { label: "m", toBase: 100 }, { label: "ft", toBase: 30.48 }] },
  { label: "Volume", units: [{ label: "CBM (m³)", toBase: 1 }, { label: "cubic ft", toBase: 0.0283168 }, { label: "liters", toBase: 0.001 }] },
];

function UnitConverterTool({ onBack, theme, isDark }) {
  const [groupIdx, setGroupIdx] = useState(0);
  const [fromIdx, setFromIdx] = useState(0);
  const [toIdx, setToIdx] = useState(1);
  const [value, setValue] = useState("1");
  const green = ac("green", isDark);

  const fieldStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, background: theme.inputBg, border: `1px solid ${theme.borderStrong}`, color: theme.text, fontSize: 14.5, outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 12.5, color: theme.textMuted, marginBottom: 6, display: "block" };

  const group = CONVERSION_GROUPS[groupIdx];
  const fromUnit = group.units[fromIdx] || group.units[0];
  const toUnit = group.units[toIdx] || group.units[0];
  const V = parseFloat(value) || 0;
  const result = (V * fromUnit.toBase) / toUnit.toBase;

  function selectGroup(i) { setGroupIdx(i); setFromIdx(0); setToIdx(CONVERSION_GROUPS[i].units.length > 1 ? 1 : 0); }

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <BackBar title="Unit Converter" accentKey="green" isDark={isDark} theme={theme} onBack={onBack} />
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 500, margin: "0 0 6px", color: theme.text }}>Convert on the fly.</h1>
      <p style={{ color: theme.textMuted, fontSize: 14.5, margin: "0 0 24px" }}>Weight, length, and volume conversions for everyday freight math.</p>

      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {CONVERSION_GROUPS.map((g, i) => (
            <button key={g.label} onClick={() => selectGroup(i)}
              style={{ padding: "8px 14px", borderRadius: 999, fontSize: 13, cursor: "pointer", border: `1px solid ${groupIdx === i ? green : theme.borderStrong}`, background: groupIdx === i ? acBg("green") : theme.surface, color: groupIdx === i ? green : theme.textMuted }}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, alignItems: "end", marginBottom: 24 }}>
        <div><label style={labelStyle}>Value</label><input value={value} onChange={(e) => setValue(e.target.value)} type="number" style={fieldStyle} /></div>
        <div><label style={labelStyle}>From</label>
          <select value={fromIdx} onChange={(e) => setFromIdx(Number(e.target.value))} style={fieldStyle}>
            {group.units.map((u, i) => <option key={u.label} value={i}>{u.label}</option>)}
          </select>
        </div>
        <div><label style={labelStyle}>To</label>
          <select value={toIdx} onChange={(e) => setToIdx(Number(e.target.value))} style={fieldStyle}>
            {group.units.map((u, i) => <option key={u.label} value={i}>{u.label}</option>)}
          </select>
        </div>
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.surfaceCard, padding: 20 }}>
        <p style={{ fontSize: 12, color: green, margin: "0 0 4px", fontFamily: "JetBrains Mono, monospace", letterSpacing: 1 }}>RESULT</p>
        <p style={{ fontSize: 30, fontWeight: 600, margin: 0, color: green }}>{result.toFixed(4)} {toUnit.label}</p>
        <p style={{ fontSize: 13, color: theme.textMuted, margin: "8px 0 0" }}>{V} {fromUnit.label} = {result.toFixed(4)} {toUnit.label}</p>
      </div>
    </div>
  );
}

function ReorderPointTool({ onBack, theme, isDark }) {
  const [avgDailyUsage, setAvgDailyUsage] = useState("");
  const [avgLeadTime, setAvgLeadTime] = useState("");
  const [maxDailyUsage, setMaxDailyUsage] = useState("");
  const [maxLeadTime, setMaxLeadTime] = useState("");
  const red = ac("red", isDark);

  const fieldStyle = { width: "100%", padding: "10px 14px", borderRadius: 10, background: theme.inputBg, border: `1px solid ${theme.borderStrong}`, color: theme.text, fontSize: 14.5, outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 12.5, color: theme.textMuted, marginBottom: 6, display: "block" };

  const avgU = parseFloat(avgDailyUsage) || 0, avgL = parseFloat(avgLeadTime) || 0, maxU = parseFloat(maxDailyUsage) || 0, maxL = parseFloat(maxLeadTime) || 0;
  const baseDemand = avgU * avgL;
  const safetyStock = Math.max(0, (maxU * maxL) - baseDemand);
  const reorderPoint = baseDemand + safetyStock;
  const hasInputs = avgU > 0 && avgL > 0;

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <BackBar title="Reorder Point Calculator" accentKey="red" isDark={isDark} theme={theme} onBack={onBack} />
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 500, margin: "0 0 6px", color: theme.text }}>When to reorder.</h1>
      <p style={{ color: theme.textMuted, fontSize: 14.5, margin: "0 0 24px" }}>Uses average and worst-case usage/lead time to set a safety-stock-backed reorder trigger.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
        <div><label style={labelStyle}>Average daily usage (units)</label><input value={avgDailyUsage} onChange={(e) => setAvgDailyUsage(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="0" /></div>
        <div><label style={labelStyle}>Average lead time (days)</label><input value={avgLeadTime} onChange={(e) => setAvgLeadTime(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="0" /></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <div><label style={labelStyle}>Max daily usage (units)</label><input value={maxDailyUsage} onChange={(e) => setMaxDailyUsage(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="optional" /></div>
        <div><label style={labelStyle}>Max lead time (days)</label><input value={maxLeadTime} onChange={(e) => setMaxLeadTime(e.target.value)} type="number" min="0" style={fieldStyle} placeholder="optional" /></div>
      </div>

      <div style={{ border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.surfaceCard, padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: hasInputs ? 18 : 0 }}>
          <div><p style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 4px" }}>Safety stock</p><p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: theme.text }}>{safetyStock.toFixed(1)} units</p></div>
          <div><p style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 4px" }}>Base demand during lead time</p><p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: theme.text }}>{baseDemand.toFixed(1)} units</p></div>
        </div>
        {hasInputs && (
          <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 18 }}>
            <p style={{ fontSize: 12, color: red, margin: "0 0 4px", fontFamily: "JetBrains Mono, monospace", letterSpacing: 1 }}>REORDER POINT</p>
            <p style={{ fontSize: 30, fontWeight: 600, margin: 0, color: red }}>{reorderPoint.toFixed(1)} units</p>
          </div>
        )}
      </div>
      <p style={{ color: theme.textFaint, fontSize: 12, marginTop: 14 }}>Formula: reorder point = (avg daily usage × avg lead time) + safety stock, where safety stock = (max daily usage × max lead time) minus that same base demand. Leave the max fields blank to skip safety stock.</p>
    </div>
  );
}

function findColumn(headers, candidates) {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

function VendorScorecardTool({ onBack, theme, isDark }) {
  const [fileName, setFileName] = useState("");
  const [scorecard, setScorecard] = useState([]);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const amber = ac("amber", isDark);
  const green = ac("green", isDark);
  const red = ac("red", isDark);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setScorecard([]);
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (results) => {
        if (!results.data.length) { setError("That file parsed but had no rows."); return; }
        const headers = results.meta.fields || Object.keys(results.data[0]);
        const vendorCol = findColumn(headers, ["vendor", "supplier", "carrier", "vendor name"]);
        const statusCol = findColumn(headers, ["status", "delivery status", "on time", "ontime", "on_time"]);
        const delayCol = findColumn(headers, ["delay days", "delaydays", "delay_days", "days late", "delay (days)"]);
        if (!vendorCol) { setError("Couldn't find a vendor/supplier/carrier column in this file."); return; }
        if (!statusCol && !delayCol) { setError("Couldn't find a status or delay-days column in this file."); return; }

        const map = {};
        results.data.forEach((row) => {
          const vendor = String(row[vendorCol] || "Unknown").trim() || "Unknown";
          if (!map[vendor]) map[vendor] = { vendor, total: 0, onTime: 0, delaySum: 0, delayCount: 0 };
          map[vendor].total += 1;
          let isOnTime = null;
          if (delayCol) {
            const d = parseFloat(row[delayCol]);
            if (!isNaN(d)) { map[vendor].delaySum += d; map[vendor].delayCount += 1; isOnTime = d <= 0; }
          }
          if (isOnTime === null && statusCol) {
            const s = String(row[statusCol] || "").toLowerCase();
            isOnTime = s.includes("on time") || s.includes("ontime") || s === "yes" || s === "true";
          }
          if (isOnTime) map[vendor].onTime += 1;
        });
        const scored = Object.values(map).map((v) => ({
          ...v,
          onTimePct: v.total > 0 ? (v.onTime / v.total) * 100 : 0,
          avgDelay: v.delayCount > 0 ? v.delaySum / v.delayCount : null,
        })).sort((a, b) => b.onTimePct - a.onTimePct);

        setFileName(file.name);
        setScorecard(scored);
      },
      error: (err) => setError("Couldn't read that file: " + err.message),
    });
  }

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <BackBar title="Vendor Scorecard" accentKey="amber" isDark={isDark} theme={theme} onBack={onBack} />
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 500, margin: "0 0 6px", color: theme.text }}>Rank vendors by reliability.</h1>
      <p style={{ color: theme.textMuted, fontSize: 14.5, margin: "0 0 20px" }}>Upload a shipment log with a vendor/supplier column and either a status column or a delay-days column.</p>

      <div onClick={() => fileInputRef.current?.click()} style={{ border: `1.5px dashed ${fileName ? amber : theme.borderStrong}`, borderRadius: 14, padding: "18px 20px", textAlign: "center", cursor: "pointer", background: fileName ? acBg("amber") : theme.surface, marginBottom: 16 }}>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
        {fileName ? <p style={{ color: amber, fontSize: 14, margin: 0 }}>{fileName} loaded — click to replace</p> : <p style={{ color: theme.text, fontSize: 14, margin: 0 }}>Click to upload a .csv file</p>}
      </div>
      {error && <p style={{ color: red, fontSize: 13, marginBottom: 14 }}>{error}</p>}

      {scorecard.length > 0 && (
        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: theme.surface }}>
                <th style={{ textAlign: "left", padding: "10px 14px", color: theme.textMuted, fontFamily: "JetBrains Mono, monospace", fontWeight: 500 }}>Rank</th>
                <th style={{ textAlign: "left", padding: "10px 14px", color: theme.textMuted, fontFamily: "JetBrains Mono, monospace", fontWeight: 500 }}>Vendor</th>
                <th style={{ textAlign: "left", padding: "10px 14px", color: theme.textMuted, fontFamily: "JetBrains Mono, monospace", fontWeight: 500 }}>Shipments</th>
                <th style={{ textAlign: "left", padding: "10px 14px", color: theme.textMuted, fontFamily: "JetBrains Mono, monospace", fontWeight: 500 }}>On-time %</th>
                <th style={{ textAlign: "left", padding: "10px 14px", color: theme.textMuted, fontFamily: "JetBrains Mono, monospace", fontWeight: 500 }}>Avg delay</th>
              </tr>
            </thead>
            <tbody>
              {scorecard.map((v, i) => (
                <tr key={v.vendor} style={{ borderTop: `1px solid ${theme.border}` }}>
                  <td style={{ padding: "10px 14px", color: theme.textFaint }}>{i + 1}</td>
                  <td style={{ padding: "10px 14px", color: theme.text }}>{v.vendor}</td>
                  <td style={{ padding: "10px 14px", color: theme.text }}>{v.total}</td>
                  <td style={{ padding: "10px 14px", color: v.onTimePct >= 90 ? green : v.onTimePct >= 70 ? amber : red }}>{v.onTimePct.toFixed(1)}%</td>
                  <td style={{ padding: "10px 14px", color: theme.textMuted }}>{v.avgDelay !== null ? `${v.avgDelay.toFixed(1)} days` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ color: theme.textFaint, fontSize: 12, marginTop: 14 }}>On-time is read from a delay-days column (0 or less = on time) when present, otherwise from the status column's text.</p>
    </div>
  );
}

const PO_STATUSES = ["Ordered", "In Transit", "Delayed", "Received"];
const PO_STATUS_KEYS = { Ordered: null, "In Transit": "cyan", Delayed: "red", Received: "green" };

function PoTrackerTool({ onBack, theme, isDark }) {
  const [pos, setPos] = useState(null);
  const [newPoName, setNewPoName] = useState("");
  const [newVendor, setNewVendor] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState("");
  const cyan = ac("cyan", isDark);

  useEffect(() => {
    try { const stored = localStorage.getItem("vant_po_tracker"); setPos(stored ? JSON.parse(stored) : []); } catch { setPos([]); }
  }, []);
  useEffect(() => {
    if (pos === null) return;
    try { localStorage.setItem("vant_po_tracker", JSON.stringify(pos)); } catch { /* no storage access */ }
  }, [pos]);

  function addPo(e) {
    e.preventDefault();
    const name = newPoName.trim();
    if (!name) return;
    setPos((p) => [...p, { id: Date.now(), name, vendor: newVendor.trim() || "Unspecified", status: "Ordered", createdAt: new Date().toISOString() }]);
    setNewPoName(""); setNewVendor("");
  }
  function setStatus(id, status) { setPos((p) => p.map((po) => (po.id === id ? { ...po, status } : po))); }
  function startEdit(po) { setEditingId(po.id); setEditValue(po.name); }
  function saveEdit(id) { const trimmed = editValue.trim(); if (trimmed) setPos((p) => p.map((po) => (po.id === id ? { ...po, name: trimmed } : po))); setEditingId(null); }
  function deletePo(id) { setPos((p) => p.filter((po) => po.id !== id)); }

  if (pos === null) return <div style={{ padding: 28, color: theme.textFaint, fontSize: 14 }}>Loading purchase orders…</div>;

  const fieldStyle = { padding: "9px 14px", borderRadius: 999, background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text, fontSize: 14, outline: "none" };

  function statusStyle(po, s) {
    const active = po.status === s;
    const key = PO_STATUS_KEYS[s];
    const color = key ? ac(key, isDark) : theme.textFaint;
    return { padding: "4px 10px", borderRadius: 999, border: `1px solid ${active ? color : theme.border}`, background: active ? (key ? acBg(key) : theme.surfaceStrong) : "transparent", color: active ? color : theme.textFaint, fontSize: 11, fontFamily: "JetBrains Mono, monospace", cursor: "pointer" };
  }

  return (
    <div style={{ padding: 28, height: "100%", display: "flex", flexDirection: "column" }}>
      <BackBar title="PO Status Tracker" accentKey="cyan" isDark={isDark} theme={theme} onBack={onBack} />
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 24, fontWeight: 500, margin: "0 0 6px", color: theme.text }}>Track purchase orders.</h1>
      <p style={{ color: theme.textMuted, fontSize: 14.5, margin: "0 0 20px" }}>Add a PO, then click its status pill to move it forward.</p>

      <form onSubmit={addPo} style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <input value={newPoName} onChange={(e) => setNewPoName(e.target.value)} placeholder="PO number or name…" style={{ ...fieldStyle, flex: 2, minWidth: 160 }} />
        <input value={newVendor} onChange={(e) => setNewVendor(e.target.value)} placeholder="Vendor" style={{ ...fieldStyle, flex: 1, minWidth: 120 }} />
        <button type="submit" style={{ width: 42, height: 42, borderRadius: 999, background: acBg("cyan"), border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><Plus size={18} color={cyan} /></button>
      </form>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
        {pos.length === 0 && <p style={{ color: theme.textFaint, fontSize: 14 }}>No purchase orders yet — add one above.</p>}
        {pos.map((po) => {
          const isEditing = editingId === po.id;
          return (
            <div key={po.id} className="v-fade" style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 12, background: theme.surface, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PO_STATUSES.map((s) => (
                  <button key={s} onClick={() => setStatus(po.id, s)} style={statusStyle(po, s)}>{s}</button>
                ))}
              </div>
              {isEditing ? (
                <>
                  <input autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(po.id); if (e.key === "Escape") setEditingId(null); }}
                    style={{ flex: 1, minWidth: 120, padding: "6px 10px", borderRadius: 8, background: theme.surfaceStrong, border: `1px solid ${ac("violet", isDark)}`, color: theme.text, fontSize: 14, outline: "none" }} />
                  <button onClick={() => saveEdit(po.id)} style={{ background: "none", border: "none", cursor: "pointer" }}><Check size={16} color={ac("green", isDark)} /></button>
                  <button onClick={() => setEditingId(null)} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={16} color={theme.textMuted} /></button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, minWidth: 100, fontSize: 14.5, color: theme.text }}>{po.name}</span>
                  <span style={{ fontSize: 12.5, color: theme.textFaint }}>{po.vendor}</span>
                  <button onClick={() => startEdit(po)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Pencil size={14} color={theme.textFaint} /></button>
                  <button onClick={() => deletePo(po.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><Trash2 size={14} color={theme.textFaint} /></button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <p style={{ color: theme.textFaint, fontSize: 12, marginTop: 14 }}>Saved locally in this browser — not yet synced to your account across devices.</p>
    </div>
  );
}

function ToolsPage({ theme, isDark }) {
  const [view, setView] = useState("hub");
  if (view === "ops") return <OpsAssistantTool onBack={() => setView("hub")} theme={theme} isDark={isDark} />;
  if (view === "weight") return <ChargeableWeightTool onBack={() => setView("hub")} theme={theme} isDark={isDark} />;
  if (view === "freight") return <FreightCostTool onBack={() => setView("hub")} theme={theme} isDark={isDark} />;
  if (view === "load") return <LoadOptimizerTool onBack={() => setView("hub")} theme={theme} isDark={isDark} />;
  if (view === "convert") return <UnitConverterTool onBack={() => setView("hub")} theme={theme} isDark={isDark} />;
  if (view === "reorder") return <ReorderPointTool onBack={() => setView("hub")} theme={theme} isDark={isDark} />;
  if (view === "scorecard") return <VendorScorecardTool onBack={() => setView("hub")} theme={theme} isDark={isDark} />;
  if (view === "po") return <PoTrackerTool onBack={() => setView("hub")} theme={theme} isDark={isDark} />;

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto" }}>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, letterSpacing: 1.5, color: theme.textFaint, margin: "0 0 6px" }}>TOOLS</p>
      <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 26, fontWeight: 500, margin: "0 0 22px", color: theme.text }}>Pick a tool.</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
        <ToolCard icon={FileSpreadsheet} accentKey="red" isDark={isDark} theme={theme} title="Ops Assistant" desc="Upload a shipment log, inventory sheet, or delivery schedule and ask real questions about it." onClick={() => setView("ops")} />
        <ToolCard icon={Calculator} accentKey="amber" isDark={isDark} theme={theme} title="Chargeable Weight Calculator" desc="Compare actual vs. volumetric weight to get the real billable freight weight." onClick={() => setView("weight")} />
        <ToolCard icon={Truck} accentKey="cyan" isDark={isDark} theme={theme} title="Freight Cost Calculator" desc="Estimate shipping cost from weight, zone, fuel surcharge, and handling fee." onClick={() => setView("freight")} />
        <ToolCard icon={Boxes} accentKey="violet" isDark={isDark} theme={theme} title="Load Optimizer" desc="Estimate how many items fit per container or pallet, and how many you'll need." onClick={() => setView("load")} />
        <ToolCard icon={RefreshCw} accentKey="green" isDark={isDark} theme={theme} title="Unit Converter" desc="Convert weight, length, and volume units used in everyday freight math." onClick={() => setView("convert")} />
        <ToolCard icon={Package} accentKey="red" isDark={isDark} theme={theme} title="Reorder Point Calculator" desc="Find the inventory level that should trigger a new order, with safety stock built in." onClick={() => setView("reorder")} />
        <ToolCard icon={ClipboardList} accentKey="amber" isDark={isDark} theme={theme} title="Vendor Scorecard" desc="Upload a shipment log and rank vendors by on-time delivery rate." onClick={() => setView("scorecard")} />
        <ToolCard icon={ListChecks} accentKey="cyan" isDark={isDark} theme={theme} title="PO Status Tracker" desc="Track purchase orders from ordered through received, saved locally." onClick={() => setView("po")} />
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

      <div style={{ marginBottom: 22 }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1, color: theme.textFaint, margin: "0 0 10px" }}>SECURITY</p>
        <p style={{ fontSize: 12.5, color: theme.textMuted, margin: "0 0 8px", lineHeight: 1.5 }}>AI features need an access code to work — ask whoever's running this deployment for it.</p>
        <input
          value={accessCode}
          onChange={(e) => onAccessCodeChange(e.target.value)}
          placeholder="Access code"
          type="password"
          style={{ width: "100%", padding: "9px 14px", borderRadius: 10, background: theme.inputBg, border: `1px solid ${theme.borderStrong}`, color: theme.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
        />
      </div>

      <div>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1, color: theme.textFaint, margin: "0 0 10px" }}>DATA</p>
        <button onClick={onClearData} style={{ padding: "9px 16px", borderRadius: 999, background: acBg("red"), border: "none", color: ac("red", isDark), fontSize: 13.5, cursor: "pointer" }}>
          Reset my VANT data
        </button>
        <p style={{ color: theme.textFaint, fontSize: 11, marginTop: 8 }}>Resets this account's saved theme, chats, tasks, and Cowork history.</p>
      </div>
    </Overlay>
  );
}

export default function VantWorkingPrototype() {
  const [active, setActive] = useState("chat");
  const [projects, setProjects] = useState([]);
  const [projectChat, setProjectChat] = useState(null);
  const [projectConversationId, setProjectConversationId] = useState(null);
  const [projectSaving, setProjectSaving] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [newChatNonce, setNewChatNonce] = useState(0);
  const [chatHistoryReady, setChatHistoryReady] = useState(false);
  const [chatCloudAvailable, setChatCloudAvailable] = useState(false);
  const [themeName, setThemeName] = useState("dark");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
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

  function loadLocalChats(userId) {
    try {
      const raw = localStorage.getItem(chatStorageKey(userId));
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? sortConversations(parsed.map(normalizeConversation)) : [];
    } catch (error) {
      console.error("VANT: failed to load local chat history", error);
      return [];
    }
  }

  function writeLocalChats(userId, items) {
    try {
      localStorage.setItem(chatStorageKey(userId), JSON.stringify(sortConversations(items)));
    } catch (error) {
      console.error("VANT: failed to save local chat history", error);
    }
  }

  async function loadChatHistory(authUser) {
    setChatHistoryReady(false);
    setActiveConversationId(null);
    setChatCloudAvailable(false);

    if (!authUser) {
      setConversations(loadLocalChats(null));
      setChatHistoryReady(true);
      return;
    }

    const { data, error } = await supabase
      .from("chat_conversations")
      .select("id, user_id, title, pinned, project_id, messages, created_at, updated_at")
      .eq("user_id", authUser.id)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(CHAT_HISTORY_LIMIT);

    if (!error) {
      const cloudChats = sortConversations((data || []).map(normalizeConversation));
      setConversations(cloudChats);
      setChatCloudAvailable(true);
      writeLocalChats(authUser.id, cloudChats);
    } else {
      console.error("VANT: cloud chat history unavailable; using local history", error);
      setConversations(loadLocalChats(authUser.id));
    }

    setChatHistoryReady(true);
  }

  function newConversation() {
    setActiveConversationId(null);
    setNewChatNonce((value) => value + 1);
    setActive("chat");
  }

  function createConversationDraft({ messages = [], projectId = null } = {}) {
    const id = newChatId();
    const now = new Date().toISOString();
    const conversation = {
      id,
      title: deriveChatTitle(messages),
      pinned: false,
      projectId,
      messages: sanitizeMessagesForPersistence(messages),
      createdAt: now,
      updatedAt: now,
    };
    setConversations((current) => {
      const next = sortConversations([conversation, ...current]);
      if (user?.id) writeLocalChats(user.id, next); else writeLocalChats(null, next);
      return next;
    });
    if (chatCloudAvailable && user?.id) {
      supabase.from("chat_conversations").upsert({
        id,
        user_id: user.id,
        title: conversation.title,
        pinned: false,
        project_id: projectId,
        messages: conversation.messages,
        created_at: now,
        updated_at: now,
      }, { onConflict: "id" }).then(({ error }) => {
        if (error) console.error("VANT: failed to create cloud conversation draft", error);
      });
    }
    setActiveConversationId(id);
    return id;
  }

  function saveConversation(id, messages, projectIdOverride = undefined) {
    if (!id) return;
    const now = new Date().toISOString();
    setConversations((current) => {
      const existing = current.find((item) => item.id === id);
      const updated = {
        ...(existing || { id, pinned: false, projectId: null, createdAt: now }),
        title: existing?.title && existing.title !== "New VANT chat" ? existing.title : deriveChatTitle(messages),
        messages: sanitizeMessagesForPersistence(messages),
        projectId: projectIdOverride !== undefined ? projectIdOverride : (existing?.projectId || null),
        updatedAt: now,
      };
      const next = sortConversations([updated, ...current.filter((item) => item.id !== id)]);
      if (user?.id) writeLocalChats(user.id, next); else writeLocalChats(null, next);
      return next;
    });
    if (chatCloudAvailable && user?.id) {
      supabase.from("chat_conversations").upsert({
        id,
        user_id: user.id,
        title: deriveChatTitle(messages),
        pinned: conversations.find((item) => item.id === id)?.pinned || false,
        project_id: projectIdOverride !== undefined ? projectIdOverride : (conversations.find((item) => item.id === id)?.projectId || null),
        messages: sanitizeMessagesForPersistence(messages),
        updated_at: now,
      }, { onConflict: "id" }).then(({ error }) => {
        if (error) console.error("VANT: failed to save cloud conversation", error);
      });
    }
  }

  function togglePinConversation(id) {
    setConversations((current) => {
      const next = sortConversations(current.map((item) => item.id === id ? { ...item, pinned: !item.pinned, updatedAt: new Date().toISOString() } : item));
      if (user?.id) writeLocalChats(user.id, next); else writeLocalChats(null, next);
      const changed = next.find((item) => item.id === id);
      if (chatCloudAvailable && user?.id && changed) {
        supabase.from("chat_conversations").update({ pinned: changed.pinned, updated_at: changed.updatedAt }).eq("id", id).eq("user_id", user.id).then(({ error }) => {
          if (error) console.error("VANT: failed to update pinned chat", error);
        });
      }
      return next;
    });
  }

  function deleteConversation(id) {
    if (!window.confirm("Delete this chat? This cannot be undone.")) return;
    setConversations((current) => {
      const next = current.filter((item) => item.id !== id);
      if (user?.id) writeLocalChats(user.id, next); else writeLocalChats(null, next);
      return next;
    });
    if (activeConversationId === id) setActiveConversationId(null);
    if (chatCloudAvailable && user?.id) {
      supabase.from("chat_conversations").delete().eq("id", id).eq("user_id", user.id).then(({ error }) => {
        if (error) console.error("VANT: failed to delete cloud conversation", error);
      });
    }
  }

  function selectConversation(id) {
    setActiveConversationId(id);
    setActive("chat");
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
      await loadChatHistory(null);
      return;
    }

    setUser(profileFromUser(authUser));
    setStateReady(false);
    await Promise.all([loadChatHistory(authUser), loadProjects(authUser)]);

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
      try {
        const { data } = await supabase.auth.getSession();
        if (activeSubscription) await loadUserState(data.session?.user || null);
      } catch (error) {
        console.error("VANT: failed to initialize auth session", error);
      } finally {
        if (activeSubscription) setAuthReady(true);
      }
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!activeSubscription || event === "INITIAL_SESSION") return;

      if (event === "SIGNED_OUT") {
        loadUserState(null).finally(() => {
          if (activeSubscription) setAuthReady(true);
        });
        return;
      }

      if (session?.user) {
        setTimeout(async () => {
          if (!activeSubscription) return;
          try {
            await loadUserState(session.user);
          } finally {
            if (activeSubscription) setAuthReady(true);
          }
        }, 0);
      } else {
        setAuthReady(true);
      }
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

  async function loadProjects(authUser) {
    if (!authUser?.id) {
      setProjects([]);
      setProjectChat(null);
      return;
    }
    const { data, error } = await supabase
      .from("projects")
      .select("id, owner_id, name, description, color, icon, priority, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("VANT: failed to load projects", error);
      setProjects([]);
      return;
    }
    setProjects((data || []).map(normalizeProject));
  }

  async function createProject(projectInput) {
    if (!user?.id) return null;
    setProjectSaving(true);
    const { data, error } = await supabase
      .from("projects")
      .insert({
        owner_id: user.id,
        name: projectInput.name,
        description: projectInput.description || "",
        color: "violet",
        icon: "folder",
        priority: "moderate",
      })
      .select("id, owner_id, name, description, color, icon, priority, created_at, updated_at")
      .single();
    setProjectSaving(false);
    if (error) {
      console.error("VANT: failed to create project", error);
      window.alert("VANT couldn't save this project. Please try again.");
      return null;
    }
    const project = normalizeProject(data);
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    return project;
  }

  async function deleteProject(projectId) {
    if (!user?.id) return;
    if (!window.confirm("Delete this project? This removes the project workspace.")) return;
    const previous = projects;
    setProjects((current) => current.filter((item) => item.id !== projectId));
    if (projectChat === projectId) setProjectChat(null);
    const { error: chatError } = await supabase
      .from("chat_conversations")
      .delete()
      .eq("user_id", user.id)
      .eq("project_id", projectId);
    if (chatError) console.error("VANT: failed to remove project chats", chatError);
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("owner_id", user.id);
    if (error) {
      console.error("VANT: failed to delete project", error);
      setProjects(previous);
      window.alert("VANT couldn't delete this project. Nothing was removed from your project list.");
    }
  }

  async function customizeProject(projectId, patch) {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("projects")
      .update(patch)
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .select("id, owner_id, name, description, color, icon, priority, created_at, updated_at")
      .single();
    if (error) {
      console.error("VANT: failed to customize project", error);
      window.alert("VANT couldn't save the project settings.");
      return;
    }
    const updated = normalizeProject(data);
    setProjects((current) => current.map((item) => item.id === projectId ? updated : item));
  }

  function openProject(projectId) {
    setProjectChat(projectId);
    setProjectConversationId(null);
    setActive("projects");
  }

  function openProjectConversation(conversationId) {
    setProjectConversationId(conversationId);
    setActiveConversationId(conversationId);
  }

  function createProjectConversation(projectId) {
    const id = createConversationDraft({ projectId, messages: [] });
    setProjectChat(projectId);
    setProjectConversationId(id);
    setActiveConversationId(id);
    return id;
  }

  function askProjectVant(projectId) {
    const prompt = "Analyze this project and help me decide what we should work on next.";
    const id = createConversationDraft({ projectId, messages: [{ role: "user", content: prompt }] });
    setProjectChat(projectId);
    setProjectConversationId(id);
    setActiveConversationId(id);
  }

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
    if (chatCloudAvailable) {
      const { error } = await supabase.from("chat_conversations").delete().eq("user_id", user.id);
      if (error) console.error("VANT: failed to clear cloud chat history", error);
    }
    writeLocalChats(user.id, []);
    setConversations([]);
    setActiveConversationId(null);
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
    if (active === "chat") return <ChatPage
      key={newChatNonce}
      {...props}
      onGoToIntegrations={() => setActive("integrations")}
      conversations={conversations.filter((item) => !item.projectId)}
      activeConversationId={activeConversationId}
      onNewConversation={newConversation}
      onCreateConversation={createConversationDraft}
      onSelectConversation={selectConversation}
      onSaveConversation={saveConversation}
      onTogglePinConversation={togglePinConversation}
      onDeleteConversation={deleteConversation}
    />;
    if (active === "projects") {
      const selectedProject = projects.find((item) => item.id === projectChat);
      if (selectedProject && projectConversationId) return <ChatPage key={"project-chat-" + projectConversationId} {...props} projectId={selectedProject.id} projectName={selectedProject.name} projectMode projectId={selectedProject.id} conversations={conversations.filter((item) => item.projectId === selectedProject.id)} activeConversationId={projectConversationId} onGoToIntegrations={() => setActive("integrations")} onNewConversation={() => createProjectConversation(selectedProject.id)} onCreateConversation={(options) => createConversationDraft({ ...options, projectId: selectedProject.id })} onSelectConversation={openProjectConversation} onSaveConversation={(id, messages, projectId) => saveConversation(id, messages, projectId || selectedProject.id)} onTogglePinConversation={togglePinConversation} onDeleteConversation={deleteConversation} onBackToProject={() => { setProjectConversationId(null); setActive("projects"); }} />;
      if (selectedProject) return <ProjectWorkspace {...props} project={selectedProject} user={user} chats={conversations.filter((item) => item.projectId === selectedProject.id)} onBack={() => { setProjectChat(null); setProjectConversationId(null); }} onCustomize={customizeProject} onNewChat={() => createProjectConversation(selectedProject.id)} onOpenChat={openProjectConversation} onAskVant={() => askProjectVant(selectedProject.id)} onProjectLeft={(projectId) => setProjects((current) => current.filter((item) => item.id !== projectId))} />;
      return <ProjectsPage {...props} projects={projects} user={user} onProjectsChange={createProject} onOpenProject={openProject} onDeleteProject={deleteProject} onCustomizeProject={customizeProject} projectSaving={projectSaving} />;
    }
    if (active === "tools") return <ToolsPage {...props} />;
    if (active === "dashboard") return <DashboardPage {...props} connected={connected} coworkTasks={appState.cowork_tasks} onGoToIntegrations={() => setActive("integrations")} />;
    if (active === "cowork") return <CoworkPage {...props} initialTasks={appState.cowork_tasks} initialHistory={appState.cowork_history} stateReady={stateReady} onPersist={persistAppState} />;
    return <IntegrationsPage {...props} connected={connected} onToggle={toggleIntegration} />;
  }

  const pageLabel = (NAV.find((n) => n.id === active) || {}).label || "";

  if (!authReady) {
    return (
      <div style={{ height: "100vh", minHeight: 640, display: "flex", alignItems: "center", justifyContent: "center", background: theme.bg, color: theme.text, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <style>{FONT_IMPORT}</style>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, margin: "0 auto 16px", borderRadius: 14, background: "rgba(124,58,237,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "#c4b5fd", fontFamily: "JetBrains Mono, monospace", fontWeight: 600, fontSize: 19 }}>V</span>
          </div>
          <div className="v-pulse" style={{ color: theme.textMuted, fontSize: 13 }}>Checking your VANT session…</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ height: "100vh", minHeight: 640, display: "flex", alignItems: "center", justifyContent: "center", background: theme.bg, color: theme.text, fontFamily: "'DM Sans', system-ui, sans-serif", position: "relative", overflow: "hidden" }}>
        <style>{FONT_IMPORT}</style>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 20%, rgba(124,58,237,0.14), transparent 38%)", pointerEvents: "none" }} />
        <div style={{ width: "100%", maxWidth: 430, padding: 24, position: "relative", zIndex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ width: 52, height: 52, margin: "0 auto 14px", borderRadius: 16, background: "rgba(124,58,237,0.22)", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${theme.border}` }}>
              <span style={{ color: "#c4b5fd", fontFamily: "JetBrains Mono, monospace", fontWeight: 600, fontSize: 20 }}>V</span>
            </div>
            <div style={{ fontFamily: "JetBrains Mono, monospace", letterSpacing: 2, fontSize: 11, color: theme.textFaint }}>VANT</div>
            <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 29, fontWeight: 500, margin: "8px 0 5px" }}>Your work starts here.</h1>
            <p style={{ color: theme.textMuted, fontSize: 13.5, margin: 0 }}>Sign in to access your VANT workspace.</p>
          </div>
          <AuthModal mode={authMode || "login"} setMode={setAuthMode} theme={theme} isDark={isDark} onClose={() => {}} onAuth={handleAuth} embedded />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", minHeight: 640, display: "flex", background: theme.bg, color: theme.text, fontFamily: "'DM Sans', system-ui, sans-serif", overflow: "hidden" }}>
      <style>{FONT_IMPORT}</style>
      <Sidebar active={active} onSelect={setActive} theme={theme} isDark={isDark} onToggleTheme={toggleTheme} onOpenSettings={() => setSettingsOpen(true)} />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar theme={theme} isDark={isDark} user={user} pageLabel={pageLabel} onOpenAuth={() => setAuthMode("signup")} onOpenSettings={() => setSettingsOpen(true)} />
        <div style={{ flex: 1, minHeight: 0 }}>{renderPage()}</div>
      </div>
      {authMode && <AuthModal mode={authMode} setMode={setAuthMode} theme={theme} isDark={isDark} onClose={() => setAuthMode(null)} onAuth={handleAuth} />}
      {settingsOpen && <SettingsModal theme={theme} isDark={isDark} onToggleTheme={toggleTheme} user={user} onClose={() => setSettingsOpen(false)} onLogout={handleLogout} onClearData={handleClearData} accessCode={accessCode} onAccessCodeChange={handleAccessCodeChange} />}
    </div>
  );
}