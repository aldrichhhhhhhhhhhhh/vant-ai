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

async function loadProjectContext(projectId) {
  if (!projectId) return null;
  try {
    const { data, error } = await supabase.rpc("get_project_context", {
      p_project_id: projectId,
    });
    if (error) {
      console.error("VANT: failed to load project context", error);
      return null;
    }
    return data || null;
  } catch (error) {
    console.error("VANT: project context request failed", error);
    return null;
  }
}

function formatProjectContext(context, { includeChats = true } = {}) {
  if (!context) return "";

  const project = context.project || {};
  const membership = context.membership || {};
  const members = Array.isArray(context.members) ? context.members : [];
  const knowledge = Array.isArray(context.knowledge) ? context.knowledge : [];
  const memory = Array.isArray(context.memory) ? context.memory : [];
  const activity = Array.isArray(context.activity) ? context.activity : [];
  const teamMessages = Array.isArray(context.team_messages) ? context.team_messages : [];
  const projectChats = Array.isArray(context.project_chats) ? context.project_chats : [];

  const lines = [
    "PROJECT INTELLIGENCE:",
    `Project: ${project.name || "Untitled project"}`,    `Description: ${project.description || "No description provided."}`,
    `Priority: ${project.priority || "moderate"}`,
    `Current user role: ${membership.role || "member"}`,
    "",
    "TEAM MEMBERS:",
    ...(members.slice(0, 20).map((member) =>
      `- ${member.display_name || member.email || "VANT User"} (${member.role || "member"})`
    ) || ["- No member data available."]),
    "",
    "PROJECT KNOWLEDGE:",
    ...(knowledge.slice(0, 30).map((item) =>
      `- [${String(item.knowledge_type || "note").toUpperCase()}] ${item.title}: ${item.content}`
    ) || ["- No project knowledge recorded yet."]),
    "",
    "PROJECT MEMORY:",
    ...(memory.slice(0, 30).map((item) =>
      `- [${String(item.memory_type || "fact").toUpperCase()}] ${item.title}: ${item.content}`
    ) || ["- No durable project memory recorded yet."]),
    "",
    "RECENT PROJECT ACTIVITY:",
    ...(activity.slice(0, 20).map((item) =>
      `- ${item.type || "activity"}: ${JSON.stringify(item.metadata || {})}`
    ) || ["- No recent activity recorded."]),
  ];

  if (teamMessages.length) {
    lines.push(
      "",
      "RECENT TEAM CHAT:",
      ...teamMessages.slice(0, 24).reverse().map((message) =>
        `- ${message.sender_type === "vant" ? "VANT" : "TEAM"}: ${message.content}`
      )
    );
  }

  if (includeChats && projectChats.length) {
    lines.push("", "RECENT PROJECT CHAT HISTORY:");
    for (const chat of projectChats.slice(0, 6)) {
      lines.push(`- CHAT: ${chat.title || "Project chat"}`);
      const chatMessages = Array.isArray(chat.messages) ? chat.messages : [];
      for (const message of chatMessages.slice(-6)) {
        const text = typeof message?.content === "string"
          ? message.content
          : Array.isArray(message?.content)
            ? message.content.filter((part) => part?.type === "text").map((part) => part.text || "").join(" ")
            : "";
        if (text.trim()) lines.push(`  - ${message.role === "assistant" ? "VANT" : "USER"}: ${text.trim()}`);
      }
    }
  }

  const result = lines.join("\n").trim();
  return result.length > 12000 ? result.slice(0, 12000) + "\n[Project intelligence truncated for model context.]" : result;
}
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

  useEffect(() => {    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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

      const projectContext = await loadProjectContext(project.id);
      const projectIntelligence = formatProjectContext(projectContext, {
        includeChats: false,
      });

      const vantPrompt =
        "You are VANT participating inside a shared project Team Chat.\n\n" +
        "PROJECT: \"" + project.name + "\"\n" +
        "PROJECT DESCRIPTION: " + (project.description || "No description provided.") + "\n\n" +
        "ROLE:\nYou are a participating team member, not the owner of the conversation.\n" +
        "Only respond when explicitly called with @VANT.\n" +
        "Use the project intelligence and team conversation as context.\n" +
        "Do not invent project facts, decisions, files, or actions.\n" +
        "Do not claim to have completed external work.\n" +
        "Be concise enough for a team chat, but provide useful structure when needed.\n" +
        "If the team asks you to summarize, summarize only the visible conversation.\n" +
        "If the team asks what to do next, give concrete next steps.\n" +
        "If information is missing, say what is missing.\n\n" +
        (projectIntelligence || "PROJECT INTELLIGENCE: No additional project context is available.") +
        "\n\nRECENT TEAM CHAT:\n" +
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
        { model: "openai/gpt-oss-20b", max_tokens: 4096 }
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
  const [knowledge, setKnowledge] = useState([]);
  const [memory, setMemory] = useState([]);
  const [intelligenceSummary, setIntelligenceSummary] = useState(null);
  const [knowledgeTitle, setKnowledgeTitle] = useState("");
  const [knowledgeContent, setKnowledgeContent] = useState("");
  const [knowledgeType, setKnowledgeType] = useState("note");
  const [memoryTitle, setMemoryTitle] = useState("");
  const [memoryContent, setMemoryContent] = useState("");
  const [memoryType, setMemoryType] = useState("fact");
  const [intelligenceBusy, setIntelligenceBusy] = useState(false);
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

  async function loadIntelligence() {
    const [knowledgeResult, memoryResult, summaryResult] = await Promise.all([
      supabase.from("project_knowledge").select("id, title, content, knowledge_type, source_type, created_by, created_at, updated_at").eq("project_id", project.id).order("updated_at", { ascending: false }).limit(100),
      supabase.from("project_memory").select("id, title, content, memory_type, source_type, confidence, created_by, created_at, updated_at").eq("project_id", project.id).order("updated_at", { ascending: false }).limit(100),
      supabase.rpc("get_project_intelligence_summary", { p_project_id: project.id }),
    ]);
    if (!knowledgeResult.error) setKnowledge(knowledgeResult.data || []);
    else console.error("VANT: failed to load project knowledge", knowledgeResult.error);
    if (!memoryResult.error) setMemory(memoryResult.data || []);
    else console.error("VANT: failed to load project memory", memoryResult.error);
    if (!summaryResult.error) setIntelligenceSummary(summaryResult.data || null);
    else console.error("VANT: failed to load intelligence summary", summaryResult.error);
  }

  useEffect(() => {
    loadMembers();
    loadIntelligence();
    const channel = supabase.channel("workspace-members-" + project.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_members", filter: "project_id=eq." + project.id }, () => loadMembers())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [project.id]);

  async function addKnowledge(e) {
    e?.preventDefault();
    if (!knowledgeTitle.trim() || !knowledgeContent.trim() || intelligenceBusy) return;
    setIntelligenceBusy(true);
    const { error } = await supabase.from("project_knowledge").insert({
      project_id: project.id,
      title: knowledgeTitle.trim(),
      content: knowledgeContent.trim(),
      knowledge_type: knowledgeType,
      source_type: "manual",
      created_by: user.id,
    });
    setIntelligenceBusy(false);
    if (error) { window.alert("VANT couldn't save that knowledge item."); return; }
    setKnowledgeTitle("");
    setKnowledgeContent("");
    await loadIntelligence();
  }

  async function deleteKnowledge(id) {
    if (!window.confirm("Remove this project knowledge item?")) return;
    const { error } = await supabase.from("project_knowledge").delete().eq("id", id).eq("project_id", project.id);
    if (error) window.alert("VANT couldn't remove that knowledge item.");
    else await loadIntelligence();
  }

  async function addMemory(e) {
    e?.preventDefault();
    if (!memoryTitle.trim() || !memoryContent.trim() || intelligenceBusy) return;
    setIntelligenceBusy(true);
    const { error } = await supabase.from("project_memory").insert({
      project_id: project.id,
      title: memoryTitle.trim(),
      content: memoryContent.trim(),
      memory_type: memoryType,
      source_type: "manual",
      confidence: 1,
      created_by: user.id,
    });
    setIntelligenceBusy(false);
    if (error) { window.alert("VANT couldn't save that memory."); return; }
    setMemoryTitle("");
    setMemoryContent("");
    await loadIntelligence();
  }

  async function deleteMemory(id) {
    if (!window.confirm("Remove this project memory?")) return;
    const { error } = await supabase.from("project_memory").delete().eq("id", id).eq("project_id", project.id);
    if (error) window.alert("VANT couldn't remove that memory.");
    else await loadIntelligence();
  }

  async function inviteMember(e) {
    e?.preventDefault();
    if (!isOwner || !inviteEmail.trim() || inviteBusy) return;
    setInviteBusy(true);
    setInviteMessage("");
    const { data, error } = await supabase.rpc("invite_project_member", { p_project_id: project.id, p_email: inviteEmail.trim(), p_role: inviteRole });
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
    const { data, error } = await supabase.rpc("manage_project_member", { p_project_id: project.id, p_user_id: member.user_id, p_action: action, p_role: role });
    if (error) {
      const message = error.message?.includes("not_project_owner") ? "Only the project owner can manage members." : error.message?.includes("invalid_role") ? "That role is not available." : "VANT couldn't update that member.";
      setInviteMessage(message);
      return;
    }
    await loadMembers();
    const updated = data?.[0];
    setInviteMessage(action === "remove" ? `${member.display_name || "Member"} removed from the project.` : `${updated?.display_name || member.display_name || "Member"} is now a ${updated?.role || role}.`);
  }

  async function leaveProject() {
    if (isOwner) return;
    setInviteMessage("");
    const { error } = await supabase.rpc("leave_project", { p_project_id: project.id });
    if (error) {
      setInviteMessage(error.message?.includes("owner_cannot_leave") ? "The project owner cannot leave this project." : "VANT couldn't leave this project.");
      return;
    }
    onProjectLeft?.(project.id);
    onBack();
  }

  function openWorkspaceWidget(widget) {
    if (widget === "chats") { if (chats.length) onOpenChat(chats[0].id); else onNewChat(); return; }
    if (widget === "team") { setWorkspacePanel("team"); return; }
    setWorkspacePanel(widget);
  }

  const color = PROJECT_COLORS.includes(project.color) ? project.color : "violet";
  const priority = PROJECT_PRIORITIES.find((item) => item.value === project.priority)?.label || "Moderate";
  const recentChats = chats.slice(0, 5);
  const currentMember = members.find((member) => member.user_id === user?.id);
  const canEditIntelligence = isOwner || currentMember?.role === "collaborator";

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "28px 34px 40px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <button type="button" onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "none", background: "transparent", color: theme.textMuted, cursor: "pointer", padding: 0, marginBottom: 22 }}><ArrowLeft size={15} /> All Projects</button>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 15, alignItems: "flex-start" }}>
            <div style={{ width: 52, height: 52, borderRadius: 15, background: acBg(color), display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid " + theme.border }}><FolderKanban size={23} color={ac(color, isDark)} /></div>
            <div><div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, letterSpacing: 1.3, color: ac(color, isDark), marginBottom: 5 }}>VANT · PROJECT WORKSPACE</div><h1 style={{ margin: 0, fontFamily: "Fraunces, serif", fontSize: 32, fontWeight: 500 }}>{project.name}</h1><p style={{ margin: "7px 0 0", color: theme.textMuted, fontSize: 14 }}>{project.description || "No project description yet."}</p></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            {isOwner && <button type="button" onClick={() => onCustomize(project.id)} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid " + theme.border, borderRadius: 10, padding: "9px 12px", background: theme.surface, color: theme.text, cursor: "pointer" }}><Palette size={15} /> Customize</button>}
            <button type="button" onClick={onAskVant} style={{ display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid " + theme.border, borderRadius: 10, padding: "9px 12px", background: theme.surface, color: theme.text, cursor: "pointer" }}><Sparkles size={15} /> Ask VANT</button>