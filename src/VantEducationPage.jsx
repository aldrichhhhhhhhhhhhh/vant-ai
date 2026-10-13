import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Search, Plus, FileText, GraduationCap, Layers, ClipboardCheck, PencilLine, FolderOpen, FlaskConical, Presentation, Calculator, CalendarDays, Trash2, Pin, PinOff, ArrowLeft, Clock3, LibraryBig, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import { supabase } from "./supabase";
import VantEducationWidgets from "./VantEducationWidgets";

const TYPE_META = {
  "notes-study-guide": { label: "Notes & guides", icon: BookOpen, color: "#7C3AED" },
  "study-assistant": { label: "Study help", icon: GraduationCap, color: "#0F766E" },
  flashcards: { label: "Flashcards", icon: Layers, color: "#6D28D9" },
  quiz: { label: "Practice quiz", icon: ClipboardCheck, color: "#BE123C" },
  practice: { label: "Flashcards & quizzes", icon: Layers, color: "#6D28D9" },
  planner: { label: "Study plans", icon: CalendarDays, color: "#0F766E" },
  essay: { label: "Writing", icon: PencilLine, color: "#7C3AED" },
  citation: { label: "Citations", icon: FileText, color: "#B45309" },
  math: { label: "Math lab", icon: Calculator, color: "#047857" },
  presentation: { label: "Presentations", icon: Presentation, color: "#0369A1" },
  research: { label: "Research", icon: FlaskConical, color: "#A16207" },
};

const FOLDERS = ["All materials", "Notes & Guides", "Flashcards", "Quizzes", "Writing", "Research", "Presentations", "Citations", "Math", "Study Plans", "General"];

function categoryFor(type) {
  if (type === "notes-study-guide" || type === "study-assistant") return "Notes & Guides";
  if (type === "flashcards" || type === "practice") return "Flashcards";
  if (type === "quiz") return "Quizzes";
  if (type === "essay") return "Writing";
  if (type === "research") return "Research";
  if (type === "presentation") return "Presentations";
  if (type === "citation") return "Citations";
  if (type === "math") return "Math";
  if (type === "planner") return "Study Plans";
  return "General";
}

function parseFlashcards(content) {
  if (!content) return null;
  const text = String(content).trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/i, "");
  try {
    const parsed = JSON.parse(text);
    return parsed?.type === "flashcards" && Array.isArray(parsed.cards) && parsed.cards.length
      ? parsed.cards.filter((card) => card && (card.front || card.question) && (card.back || card.answer)).map((card) => ({ front: String(card.front || card.question), back: String(card.back || card.answer), topic: card.topic || "" }))
      : null;
  } catch {
    return null;
  }
}

function displayDate(value) {
  if (!value) return "Just saved";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Just saved" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function VantEducationPage({ theme, isDark, user, onGoToTools, onGoToEducation, showEducationWidgets = true }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [folder, setFolder] = useState("All materials");
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");\n  const [flashcardIndex, setFlashcardIndex] = useState(0);\n  const [flashcardFlipped, setFlashcardFlipped] = useState(false);

  const loadMaterials = useCallback(async () => {
    if (!user?.id || user.isGuest) {
      setMaterials([]);
      setLoading(false);
      setError("Sign in with an account to use your private Education library.");
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("study_materials")
      .select("id,user_id,title,material_type,topic,content,source_notes,folder,pinned,created_at,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });
    if (loadError) {
      console.error("VANT Education: failed to load materials", loadError);
      setError("Your library couldn't load right now. Please try refreshing.");
      setMaterials([]);
    } else {
      setMaterials(data || []);
    }
    setLoading(false);
  }, [user?.id, user?.isGuest]);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  const visibleMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((item) => {
      const matchesFolder = folder === "All materials" || (item.folder || categoryFor(item.material_type)) === folder;
      const matchesSearch = !q || [item.title, item.topic, item.content, item.material_type].some((value) => String(value || "").toLowerCase().includes(q));
      return matchesFolder && matchesSearch;
    });
  }, [materials, folder, search]);

  async function togglePinned(item) {
    setBusyId(item.id);
    const { data, error: updateError } = await supabase.from("study_materials").update({ pinned: !item.pinned, updated_at: new Date().toISOString() }).eq("id", item.id).eq("user_id", user.id).select().single();
    if (updateError) setNotice("Couldn't update this material. Try again.");
    else {
      setMaterials((current) => current.map((entry) => entry.id === item.id ? data : entry));
      if (selected?.id === item.id) setSelected(data);
      setNotice(data.pinned ? "Pinned to the top of your library." : "Removed from pinned materials.");
    }
    setBusyId("");
  }

  async function deleteMaterial(item) {
    if (!window.confirm("Delete “" + item.title + "” from VANT Education? This cannot be undone.")) return;
    setBusyId(item.id);
    const { error: deleteError } = await supabase.from("study_materials").delete().eq("id", item.id).eq("user_id", user.id);
    if (deleteError) setNotice("Couldn't delete this material. Please try again.");
    else {
      setMaterials((current) => current.filter((entry) => entry.id !== item.id));
      if (selected?.id === item.id) setSelected(null);
      setNotice("Study material deleted.");
    }
    setBusyId("");
  }

  const count = materials.length;
  const pinnedCount = materials.filter((item) => item.pinned).length;
  const recentCount = materials.filter((item) => Date.now() - new Date(item.updated_at || item.created_at).getTime() < 7 * 86400000).length;
  const panel = { background: theme.surfaceCard || theme.surface, border: "1px solid " + theme.border, borderRadius: 18 };
  const softPanel = { background: theme.surface, border: "1px solid " + theme.border, borderRadius: 14 };
  const accent = "#7C3AED";

  if (selected) {
    const meta = TYPE_META[selected.material_type] || { label: categoryFor(selected.material_type), icon: FileText, color: accent };
    const Icon = meta.icon;
    return <div style={{ padding: "clamp(18px,3vw,32px)", height: "100%", overflowY: "auto", color: theme.text }}>
      <button onClick={() => { setSelected(null); setFlashcardIndex(0); setFlashcardFlipped(false); }} style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "1px solid " + theme.border, background: theme.surface, color: theme.text, borderRadius: 10, padding: "9px 12px", cursor: "pointer", marginBottom: 20 }}><ArrowLeft size={15} /> Back to library</button>
      <div style={{ ...panel, padding: "clamp(18px,3vw,30px)", maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div style={{ width: 48, height: 48, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 14, background: meta.color + "18", color: meta.color }}><Icon size={23} /></div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <span style={{ color: meta.color, fontSize: 11, fontWeight: 750, letterSpacing: 1.1, textTransform: "uppercase" }}>{meta.label}</span>
            <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 500, fontSize: "clamp(24px,3vw,34px)", margin: "5px 0 8px", overflowWrap: "anywhere" }}>{selected.title}</h1>
            <p style={{ color: theme.textMuted, fontSize: 13, margin: 0 }}>{selected.topic || "No subject added"} · Saved {displayDate(selected.created_at)}</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => togglePinned(selected)} disabled={busyId === selected.id} style={{ border: "1px solid " + theme.border, background: theme.surface, color: theme.text, borderRadius: 9, padding: "8px 10px", cursor: "pointer", display: "flex", gap: 7, alignItems: "center" }}>{selected.pinned ? <PinOff size={14} /> : <Pin size={14} />}{selected.pinned ? "Unpin" : "Pin"}</button>
            <button onClick={() => deleteMaterial(selected)} disabled={busyId === selected.id} style={{ border: "1px solid " + theme.border, background: theme.surface, color: "#DC2626", borderRadius: 9, padding: "8px 10px", cursor: "pointer", display: "flex", gap: 7, alignItems: "center" }}><Trash2 size={14} /> Delete</button>
          </div>
        </div>
        {selected.source_notes && <details style={{ ...softPanel, marginTop: 24, padding: 14 }}><summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 650 }}>View original notes / source</summary><pre style={{ whiteSpace: "pre-wrap", font: "inherit", color: theme.textMuted, fontSize: 13, lineHeight: 1.65, marginBottom: 0 }}>{selected.source_notes}</pre></details>}
        <div style={{ marginTop: 24, padding: "clamp(14px,2.5vw,26px)", ...softPanel }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: theme.textMuted, fontSize: 11, fontWeight: 750, letterSpacing: 1, marginBottom: 16 }}><BookOpen size={15} /> {interactiveCards ? "INTERACTIVE FLASHCARDS" : "STUDY MATERIAL"}</div>
          {interactiveCards && currentCard ? <>
            <p style={{ color: theme.textMuted, fontSize: 12, margin: "0 0 12px" }}>Click the card to reveal the answer, then move through your saved set.</p>
            <button type="button" onClick={() => setFlashcardFlipped((value) => !value)} aria-label={flashcardFlipped ? "Show flashcard question" : "Reveal flashcard answer"} style={{ width: "100%", minHeight: 230, padding: "clamp(22px,4vw,38px)", borderRadius: 18, border: "1px solid " + theme.borderStrong, background: isDark ? "linear-gradient(145deg,#241c3b,#171522)" : "linear-gradient(145deg,#F5F0FF,#FFFFFF)", color: theme.text, cursor: "pointer", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 30px rgba(124,58,237,.08)" }}>
              <span style={{ color: accent, fontSize: 10, fontWeight: 800, letterSpacing: 1.5, marginBottom: 18 }}>{flashcardFlipped ? "ANSWER" : "CARD " + (flashcardIndex + 1) + " OF " + interactiveCards.length}</span>
              <span style={{ fontSize: "clamp(18px,2.5vw,24px)", fontWeight: 650, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{flashcardFlipped ? currentCard.back : currentCard.front}</span>
              {currentCard.topic && <span style={{ color: theme.textMuted, fontSize: 12, marginTop: 18 }}>Topic: {currentCard.topic}</span>}
              <span style={{ color: theme.textMuted, fontSize: 11, marginTop: 20 }}>{flashcardFlipped ? "Click to return to question" : "Click to reveal answer"}</span>
            </button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 14 }}>
              <button type="button" disabled={flashcardIndex === 0} onClick={() => { setFlashcardIndex((index) => Math.max(0, index - 1)); setFlashcardFlipped(false); }} style={{ border: "1px solid " + theme.border, borderRadius: 9, padding: "9px 13px", background: theme.surface, color: theme.text, opacity: flashcardIndex === 0 ? .45 : 1, cursor: flashcardIndex === 0 ? "not-allowed" : "pointer" }}>← Previous</button>
              <span style={{ color: theme.textMuted, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{flashcardIndex + 1} / {interactiveCards.length}</span>
              <button type="button" disabled={flashcardIndex >= interactiveCards.length - 1} onClick={() => { setFlashcardIndex((index) => Math.min(interactiveCards.length - 1, index + 1)); setFlashcardFlipped(false); }} style={{ border: 0, borderRadius: 9, padding: "10px 14px", background: accent, color: "#FFFFFF", cursor: flashcardIndex >= interactiveCards.length - 1 ? "not-allowed" : "pointer", opacity: flashcardIndex >= interactiveCards.length - 1 ? .45 : 1 }}>Next →</button>
            </div>
          </> : <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit", fontSize: 14, lineHeight: 1.8, color: theme.text, margin: 0 }}>{selected.content}</pre>}
        </div>
      </div>
    </div>;
  }

  return <div style={{ padding: "clamp(18px,3vw,32px)", height: "100%", overflowY: "auto", color: theme.text }}>
    <div style={{ maxWidth: 1320, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1.7, color: accent, margin: "0 0 8px" }}>VANT · STUDENTS & LEARNING</p>
          <h1 style={{ fontFamily: "Fraunces, Georgia, serif", fontWeight: 500, fontSize: "clamp(28px,3.3vw,38px)", margin: "0 0 8px" }}>VANT Education</h1>
          <p style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.6, margin: 0, maxWidth: 650 }}>Your personal learning library. Keep your notes, practice sets, writing, and research in one calm workspace.</p>
        </div>
        <button onClick={onGoToTools} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: accent, color: "#FFFFFF", border: 0, borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 8px 20px #7C3AED22" }}><Plus size={16} /> Create study material</button>
      </div>

      {showEducationWidgets && <section style={{ marginBottom: 24 }}><div style={{ marginBottom: 12 }}><h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 22, fontWeight: 500, margin: "0 0 5px" }}>Your study workspace</h2><p style={{ color: theme.textMuted, fontSize: 12.5, margin: 0 }}>Plan deadlines, track progress, and keep writing documents close at hand.</p></div><VantEducationWidgets theme={theme} isDark={isDark} user={user} embedded onGoToEducation={onGoToEducation} onGoToTools={onGoToTools} /></section>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 12, marginBottom: 22 }}>
        {[{ label: "SAVED MATERIALS", value: count, icon: LibraryBig, color: accent }, { label: "PINNED", value: pinnedCount, icon: Pin, color: "#B45309" }, { label: "ADDED THIS WEEK", value: recentCount, icon: Clock3, color: "#0F766E" }].map((stat) => {
          const Icon = stat.icon;
          return <div key={stat.label} style={{ ...panel, padding: 17, display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 40, height: 40, display: "grid", placeItems: "center", borderRadius: 12, background: stat.color + "17", color: stat.color }}><Icon size={19} /></div>
            <div><p style={{ color: theme.textMuted, fontSize: 10, fontWeight: 750, letterSpacing: 1, margin: "0 0 5px" }}>{stat.label}</p><strong style={{ fontSize: 25, fontWeight: 650 }}>{stat.value}</strong></div>
          </div>;
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(175px,220px) minmax(0,1fr)", gap: 18, alignItems: "start" }}>
        <aside style={{ ...panel, padding: 12 }}>
          <p style={{ color: theme.textMuted, fontSize: 10, fontWeight: 750, letterSpacing: 1.2, padding: "8px 9px", margin: 0 }}>YOUR LIBRARY</p>
          {FOLDERS.map((name) => {
            const active = folder === name;
            const amount = name === "All materials" ? count : materials.filter((item) => (item.folder || categoryFor(item.material_type)) === name).length;
            return <button key={name} onClick={() => setFolder(name)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 9px", marginTop: 2, textAlign: "left", border: 0, borderRadius: 9, background: active ? (isDark ? "#7C3AED2A" : "#EDE9FE") : "transparent", color: active ? (isDark ? "#C4B5FD" : "#6D28D9") : theme.textMuted, fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: "pointer" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}><FolderOpen size={15} />{name}</span><span style={{ fontSize: 11, opacity: .8 }}>{amount}</span>
            </button>;
          })}
        </aside>

        <section style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 220px" }}><Search size={16} style={{ position: "absolute", left: 12, top: 12, color: theme.textFaint }} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tools, notes, papers…" style={{ width: "100%", boxSizing: "border-box", border: "1px solid " + theme.border, borderRadius: 11, padding: "11px 12px 11px 36px", background: theme.surface, color: theme.text, outline: "none", fontSize: 13 }} /></div>
            <button onClick={loadMaterials} disabled={loading} style={{ border: "1px solid " + theme.border, background: theme.surface, color: theme.textMuted, borderRadius: 10, padding: 10, cursor: "pointer" }} title="Refresh library"><RefreshCw size={15} className={loading ? "v-pulse" : ""} /></button>
          </div>

          {notice && <div role="status" style={{ padding: "10px 12px", borderRadius: 10, background: theme.surface, color: theme.textMuted, fontSize: 12, marginBottom: 12 }}>{notice}</div>}
          {error && <div role="alert" style={{ ...softPanel, padding: 18, display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}><AlertCircle size={18} color="#B45309" /><div style={{ flex: 1 }}><p style={{ margin: "0 0 8px", fontSize: 13 }}>{error}</p>{user?.isGuest && <p style={{ margin: 0, fontSize: 12, color: theme.textMuted }}>Create an account to keep materials private and available across devices.</p>}</div></div>}

          {loading ? <div style={{ ...panel, padding: 48, textAlign: "center", color: theme.textMuted }}><RefreshCw size={24} className="v-pulse" /><p>Opening your library…</p></div> : !error && visibleMaterials.length === 0 ? <div style={{ ...panel, padding: "48px 24px", textAlign: "center" }}>
            <div style={{ width: 58, height: 58, borderRadius: 18, background: isDark ? "#7C3AED24" : "#EDE9FE", color: accent, display: "grid", placeItems: "center", margin: "0 auto 16px" }}><LibraryBig size={26} /></div>
            <h2 style={{ fontFamily: "Fraunces, Georgia, serif", fontSize: 23, fontWeight: 500, margin: "0 0 8px" }}>{search || folder !== "All materials" ? "No matching materials" : "Your study library starts here"}</h2>
            <p style={{ maxWidth: 430, margin: "0 auto 18px", color: theme.textMuted, fontSize: 13, lineHeight: 1.65 }}>{search || folder !== "All materials" ? "Try another search or choose a different folder." : "Save any result from the student tools and it will appear here, linked to your account."}</p>
            {!search && folder === "All materials" && <button onClick={onGoToTools} style={{ border: 0, borderRadius: 10, background: accent, color: "#FFFFFF", padding: "10px 14px", cursor: "pointer", fontWeight: 650 }}><Sparkles size={14} style={{ verticalAlign: "middle", marginRight: 7 }} />Explore learning tools</button>}
          </div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(min(100%,265px),1fr))", gap: 12 }}>
            {visibleMaterials.map((item) => {
              const meta = TYPE_META[item.material_type] || { label: categoryFor(item.material_type), icon: FileText, color: accent };
              const Icon = meta.icon;
              return <article key={item.id} style={{ ...panel, padding: 16, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 208 }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 39, height: 39, display: "grid", placeItems: "center", borderRadius: 12, background: meta.color + "18", color: meta.color }}><Icon size={19} /></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {item.pinned && <Pin size={14} color="#B45309" />}
                    <button aria-label={item.pinned ? "Unpin material" : "Pin material"} onClick={() => togglePinned(item)} disabled={busyId === item.id} style={{ border: 0, background: "transparent", color: theme.textFaint, padding: 6, cursor: "pointer" }}><Pin size={14} /></button>
                    <button aria-label="Delete material" onClick={() => deleteMaterial(item)} disabled={busyId === item.id} style={{ border: 0, background: "transparent", color: theme.textFaint, padding: 6, cursor: "pointer" }}><Trash2 size={14} /></button>
                  </div>
                </div>
                <button onClick={() => setSelected(item)} style={{ display: "block", textAlign: "left", border: 0, background: "transparent", color: theme.text, padding: 0, cursor: "pointer" }}>
                  <span style={{ color: meta.color, fontSize: 10, fontWeight: 750, letterSpacing: 1, textTransform: "uppercase" }}>{meta.label}</span>
                  <h3 style={{ fontSize: 15, lineHeight: 1.4, fontWeight: 700, margin: "6px 0 5px", overflowWrap: "anywhere" }}>{item.title}</h3>
                </button>
                <p style={{ color: theme.textMuted, fontSize: 11.5, margin: "0 0 10px" }}>{item.topic || "General subject"} · {displayDate(item.updated_at || item.created_at)}</p>
                <p style={{ color: theme.textMuted, fontSize: 12, lineHeight: 1.55, margin: "0 0 15px", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere", flex: 1 }}>{String(item.content || "").replace(/[#*_\x60]/g, "").slice(0, 230)}</p>
                <button onClick={() => setSelected(item)} style={{ width: "100%", border: "1px solid " + theme.border, background: theme.surface, color: theme.text, borderRadius: 9, padding: "9px 10px", fontSize: 12, fontWeight: 650, cursor: "pointer" }}>Open material <span aria-hidden="true">→</span></button>
              </article>;
            })}
          </div>}
        </section>
      </div>
      <p style={{ color: theme.textFaint, fontSize: 11.5, marginTop: 24, lineHeight: 1.6 }}>Private to your account. VANT Education currently stores generated study materials and their source notes; file uploads and automatic planner sync are the next stages.</p>
    </div>
  </div>;
}
