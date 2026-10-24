import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, Plus, Search, Trash2, Pencil, X, Check, Sparkles, BookOpen, Target, Heart, Lightbulb, RefreshCw } from "lucide-react";
import { supabase } from "./supabase";

const MEMORY_TYPES = [
  { value: "fact", label: "Fact", icon: BookOpen },
  { value: "preference", label: "Preference", icon: Heart },
  { value: "goal", label: "Goal", icon: Target },
  { value: "project", label: "Ongoing work", icon: Lightbulb },
  { value: "instruction", label: "Instruction", icon: Sparkles },
  { value: "other", label: "Other", icon: BookOpen },
];

const EMPTY_FORM = { title: "", content: "", memory_type: "fact" };

export default function VantMemoryPage({ theme, isDark, user }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);

  const gold = isDark ? "#D0A650" : "#B9913F";
  const field = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: "1px solid " + theme.borderStrong, background: theme.inputBg, color: theme.text, font: "inherit", fontSize: 13, outline: "none" };
  const button = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

  async function loadMemories() {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("vant_memories")
      .select("id, title, content, memory_type, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (loadError) {
      console.error("VANT Memory: failed to load memories", loadError);
      setError("VANT Memory couldn't load your saved items. Please refresh and try again.");
      setMemories([]);
    } else {
      setMemories(data || []);
    }
    setLoading(false);
  }

  useEffect(() => { if (user?.id && !user?.isGuest) loadMemories(); else { setMemories([]); setLoading(false); } }, [user?.id, user?.isGuest]);

  const filtered = useMemo(() => memories.filter((item) => {
    const matchesType = typeFilter === "all" || item.memory_type === typeFilter;
    const haystack = (item.title + " " + item.content).toLowerCase();
    return matchesType && haystack.includes(query.trim().toLowerCase());
  }), [memories, typeFilter, query]);

  function startNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({ title: item.title, content: item.content || "", memory_type: item.memory_type || "fact" });
    setError("");
    setNotice("");
    setFormOpen(true);
  }

  async function saveMemory(e) {
    e?.preventDefault();
    const title = form.title.trim();
    const content = form.content.trim();
    if (!title) { setError("Give this memory a short title."); return; }
    if (!content) { setError("Add the detail you want VANT to remember."); return; }
    if (!user?.id || user.isGuest) { setError("Sign in to save personal memories."); return; }
    setBusy(true);
    setError("");
    setNotice("");
    const payload = { user_id: user.id, title, content, memory_type: form.memory_type };
    const result = editingId
      ? await supabase.from("vant_memories").update({ title, content, memory_type: form.memory_type }).eq("id", editingId).eq("user_id", user.id).select("id, title, content, memory_type, created_at, updated_at").single()
      : await supabase.from("vant_memories").insert(payload).select("id, title, content, memory_type, created_at, updated_at").single();
    setBusy(false);
    if (result.error) {
      console.error("VANT Memory: save failed", result.error);
      setError("Couldn't save this memory. Please try again.");
      return;
    }
    setMemories((current) => editingId
      ? current.map((item) => item.id === editingId ? result.data : item).sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      : [result.data, ...current]);
    setFormOpen(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setNotice(editingId ? "Memory updated." : "Memory saved. VANT can use it as personal context.");
  }

  async function deleteMemory(item) {
    if (!window.confirm("Delete “" + item.title + "” from VANT Memory?")) return;
    setError("");
    const { error: deleteError } = await supabase.from("vant_memories").delete().eq("id", item.id).eq("user_id", user.id);
    if (deleteError) {
      console.error("VANT Memory: delete failed", deleteError);
      setError("Couldn't delete that memory. Please try again.");
      return;
    }
    setMemories((current) => current.filter((memory) => memory.id !== item.id));
    setNotice("Memory deleted.");
  }

  return (
    <div className="vant-memory-page" style={{ height: "100%", overflowY: "auto", padding: "clamp(20px, 3vw, 34px)", maxWidth: 1100, margin: "0 auto", width: "100%" }}>
      <div className="vant-memory-hero" style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 26 }}>
        <div style={{ width: 48, height: 48, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(208,166,80,0.13)", border: "1px solid rgba(208,166,80,0.24)", flexShrink: 0 }}>
          <BrainCircuit size={23} color={gold} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: gold, fontFamily: "JetBrains Mono, monospace", fontSize: 10, letterSpacing: 1.8, marginBottom: 6 }}>PERSONAL CONTEXT</div>
          <h1 className="vant-memory-title" style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 29, fontWeight: 500, margin: "0 0 7px", color: theme.text }}>VANT Memory</h1>
          <p style={{ color: theme.textMuted, fontSize: 13.5, lineHeight: 1.6, margin: 0, maxWidth: 660 }}>Give VANT context that lasts beyond one conversation. Save preferences, goals, important facts, and working instructions — and stay in control of what it remembers.</p>
        </div>
        <button type="button" onClick={startNew} style={{ ...button, background: "linear-gradient(135deg,#D0A650,#B9913F)", color: "#191919", border: "1px solid #B9913F", whiteSpace: "nowrap" }}><Plus size={15} /> Add memory</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, marginBottom: 22 }}>
        {[{ label: "SAVED MEMORIES", value: memories.length }, { label: "CATEGORIES", value: new Set(memories.map((m) => m.memory_type)).size }, { label: "YOUR CONTROL", value: "Always" }].map((item) => (
          <div key={item.label} style={{ padding: "14px 15px", borderRadius: 13, border: "1px solid " + theme.border, background: theme.surface }}>
            <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, letterSpacing: 1.1, color: theme.textFaint }}>{item.label}</div>
            <div style={{ color: theme.text, fontSize: 21, fontWeight: 600, marginTop: 7 }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: "1 1 230px", position: "relative" }}><Search size={15} color={theme.textFaint} style={{ position: "absolute", left: 12, top: 12 }} /><input aria-label="Search memories" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your memories…" style={{ ...field, paddingLeft: 36 }} /></div>
        <select aria-label="Filter memories by category" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ ...field, width: "auto", minWidth: 160 }}><option value="all">All categories</option>{MEMORY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
        <button type="button" onClick={loadMemories} disabled={loading} style={{ ...button, background: theme.surface, color: theme.textMuted, border: "1px solid " + theme.border, opacity: loading ? 0.6 : 1 }}><RefreshCw size={14} /> Refresh</button>
      </div>

      {notice && <div role="status" style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(4,120,87,0.25)", background: "rgba(4,120,87,0.08)", color: isDark ? "#6ee7b7" : "#047857", fontSize: 12.5 }}>{notice}</div>}
      {error && <div role="alert" style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(185,28,28,0.25)", background: "rgba(185,28,28,0.08)", color: isDark ? "#fca5a5" : "#B91C1C", fontSize: 12.5 }}>{error}</div>}

      {formOpen && (
        <form onSubmit={saveMemory} style={{ marginBottom: 20, padding: 18, borderRadius: 16, border: "1px solid rgba(208,166,80,0.32)", background: theme.surfaceCard }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}><div style={{ fontSize: 14, fontWeight: 650, color: theme.text }}>{editingId ? "Edit memory" : "Add a memory"}</div><button type="button" onClick={() => { setFormOpen(false); setError(""); }} aria-label="Close memory editor" style={{ border: "none", background: "transparent", color: theme.textMuted, cursor: "pointer" }}><X size={16} /></button></div>
          <label style={{ display: "block", fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>Title</label><input maxLength={120} value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} placeholder="e.g. My preferred writing style" style={{ ...field, marginBottom: 13 }} />
          <label style={{ display: "block", fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>What should VANT remember?</label><textarea maxLength={4000} rows={4} value={form.content} onChange={(e) => setForm((current) => ({ ...current, content: e.target.value }))} placeholder="Write the detail clearly. Avoid passwords or sensitive information." style={{ ...field, resize: "vertical", lineHeight: 1.55, marginBottom: 13 }} />
          <label style={{ display: "block", fontSize: 12, color: theme.textMuted, marginBottom: 6 }}>Category</label><select value={form.memory_type} onChange={(e) => setForm((current) => ({ ...current, memory_type: e.target.value }))} style={{ ...field, marginBottom: 15 }}>{MEMORY_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}><span style={{ fontSize: 11, color: theme.textFaint }}>Private to your account · Editable and deletable anytime</span><div style={{ display: "flex", gap: 8 }}><button type="button" onClick={() => { setFormOpen(false); setError(""); }} style={{ ...button, border: "1px solid " + theme.border, background: "transparent", color: theme.textMuted }}>Cancel</button><button type="submit" disabled={busy} style={{ ...button, border: "1px solid #B9913F", background: "linear-gradient(135deg,#D0A650,#B9913F)", color: "#191919", opacity: busy ? 0.65 : 1 }}>{busy ? "Saving…" : <><Check size={14} /> Save memory</>}</button></div></div>
        </form>
      )}

      {loading ? <div style={{ padding: 36, textAlign: "center", color: theme.textMuted, fontSize: 13 }}>Loading your memories…</div> : filtered.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12 }}>
          {filtered.map((item) => {
            const type = MEMORY_TYPES.find((candidate) => candidate.value === item.memory_type) || MEMORY_TYPES[0];
            const Icon = type.icon;
            return <article key={item.id} style={{ minWidth: 0, padding: 16, borderRadius: 15, border: "1px solid " + theme.border, background: theme.surfaceCard }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}><div style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(208,166,80,0.10)", flexShrink: 0 }}><Icon size={16} color={gold} /></div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 650, color: theme.text, overflowWrap: "anywhere" }}>{item.title}</div><div style={{ fontSize: 10.5, color: gold, marginTop: 4 }}>{type.label.toUpperCase()}</div></div><button type="button" onClick={() => startEdit(item)} aria-label={"Edit " + item.title} title="Edit memory" style={{ border: "1px solid " + theme.border, borderRadius: 8, background: theme.surface, color: theme.textMuted, padding: 6, cursor: "pointer" }}><Pencil size={13} /></button><button type="button" onClick={() => deleteMemory(item)} aria-label={"Delete " + item.title} title="Delete memory" style={{ border: "1px solid " + theme.border, borderRadius: 8, background: theme.surface, color: theme.textMuted, padding: 6, cursor: "pointer" }}><Trash2 size={13} /></button></div>
              <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: theme.textMuted, fontSize: 12.5, lineHeight: 1.65, margin: "14px 0 12px" }}>{item.content}</p>
              <div style={{ borderTop: "1px solid " + theme.border, paddingTop: 9, fontSize: 10.5, color: theme.textFaint }}>Updated {new Date(item.updated_at || item.created_at).toLocaleDateString()}</div>
            </article>;
          })}
        </div>
      ) : (
        <div style={{ padding: "46px 20px", border: "1px dashed " + theme.borderStrong, borderRadius: 18, textAlign: "center", background: theme.surface }}>
          <BrainCircuit size={28} color={gold} />
          <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 500, fontSize: 21, color: theme.text, margin: "12px 0 7px" }}>{memories.length ? "No matching memories" : "A better VANT starts with context."}</h2>
          <p style={{ color: theme.textMuted, fontSize: 13, lineHeight: 1.6, maxWidth: 440, margin: "0 auto 17px" }}>{memories.length ? "Try a different search or category." : "Save details you want VANT to carry between conversations. You choose what is saved, and you can edit or delete it whenever you want."}</p>
          {!memories.length && <button type="button" onClick={startNew} style={{ ...button, border: "1px solid #B9913F", background: "linear-gradient(135deg,#D0A650,#B9913F)", color: "#191919" }}><Plus size={14} /> Save your first memory</button>}
        </div>
      )}
    </div>
  );
}
