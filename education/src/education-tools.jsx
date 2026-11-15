import {useState,useEffect,useMemo,useRef,useCallback} from "react";
import Papa from "papaparse";import katex from "katex";import "katex/dist/katex.min.css";
import {supabase} from "./supabase.js";import askVant from "./askVant.js";import {BackBar,ToolCard,VantMarkdown} from "./EducationUiPrimitives.jsx";
import {BookOpen,GraduationCap,Layers,ClipboardCheck,CalendarDays,FileText,PencilLine,Pencil,Calculator,Presentation,FlaskConical,Target,Copy,FileSpreadsheet,FolderKanban,RefreshCw,ChevronRight,ChevronLeft,ArrowLeft,ArrowRight,Plus,Trash2,Check,X,Clock3,Search,Sparkles,ListChecks,ClipboardList,Package,Truck,Boxes,Download,Upload,Camera,Paperclip,Link2,Image as ImageIcon,CircleCheck,CircleHelp,Lightbulb,BookMarked,Settings,MoreHorizontal,Edit,Eye,EyeOff,Play,RotateCcw,FileCheck2,NotepadText,BookOpenCheck,CalendarRange,Clock,Save,Clipboard,CheckCircle2,AlertCircle,Mic,Table,FileType,PanelTop,Book,FilePlus,CalendarCheck,MoveRight,PenTool,BookText,BarChart,Menu,User,Share2,Printer,ExternalLink,Info,TriangleAlert,WandSparkles,Briefcase} from "lucide-react";
const ACCENT="#7C3AED";const ac=(key,isDark)=>({violet:isDark?"#C4B5FD":"#7C3AED",cyan:isDark?"#67E8F9":"#0E7490",green:isDark?"#6EE7B7":"#047857",amber:isDark?"#FCD34D":"#B45309",red:isDark?"#FCA5A5":"#B91C1C"}[key]||ACCENT);const acBg=(key,isDark)=>isDark?({violet:"rgba(167,139,250,.16)",cyan:"rgba(103,232,249,.15)",green:"rgba(110,231,183,.15)",amber:"rgba(252,211,77,.15)",red:"rgba(252,165,165,.15)"}[key]||"rgba(167,139,250,.16)"):( {violet:"rgba(124,58,237,.10)",cyan:"rgba(14,116,144,.10)",green:"rgba(4,120,87,.10)",amber:"rgba(180,83,9,.10)",red:"rgba(185,28,28,.10)"}[key]||"rgba(124,58,237,.10)");
function cleanStudyFormatting(value) {
  return String(value || "")
    .replace(/\r/g, "")
    .replace(/^\s*\\?[-_]{3,}(?:\s*\\?[-_]{2,})*\s*$/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*\\\[|\s*\\\]$/gm, "")
    .replace(/^\s*\$\$\s*$/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
    .replace(/^\s*\|(.+)\|\s*$/gm, (_, row) => row.split("|").map((cell) => cell.trim()).filter(Boolean).join("  •  "))
    .replace(/^\s*\\-{3,}\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function saveStudyMaterialToDevice({ title, type, topic, content, sourceNotes = "", userId }) {
  if (!userId) return { ok: false, message: "Sign in to save materials to your private VANT Education library." };
  const item = {
    user_id: userId,
    title: String(title || "Study material").trim().slice(0, 200) || "Study material",
    material_type: String(type || "study-material"),
    topic: String(topic || "").trim(),
    content: String(content || "").trim(),
    source_notes: String(sourceNotes || "").trim(),
    folder: ({
      "notes-study-guide": "Notes & Guides", "study-assistant": "Notes & Guides",
      flashcards: "Flashcards", quiz: "Quizzes", practice: "Flashcards",
      planner: "Study Plans", essay: "Writing", citation: "Citations",
      math: "Math", presentation: "Presentations", research: "Research"
    })[String(type || "")] || "General",
  };
  const { error } = await supabase.from("study_materials").insert(item);
  if (error) {
    console.error("VANT Education: save failed", error);
    return { ok: false, message: "Couldn't save to VANT Education. Please try again." };
  }
  return { ok: true, message: "Saved to your VANT Education library. You can reopen it anytime from the Education tab." };
}


export function StudyAssistantTool({ onBack, theme, isDark, user }) {
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("High school");
  const [goal, setGoal] = useState("Explain a topic");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  async function generateStudyHelp() {
    if (!subject.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult("");
    setSaveMessage("");
    const prompt = `Help a student study. Subject/topic: ${subject.trim()}. Level: ${level}. Goal: ${goal}. ${notes.trim() ? `Student-provided notes or context:\n${notes.trim()}\n\n` : ""}Tailor the answer to the level and goal. Use a clean, natural reading format with simple section titles and short paragraphs. Do NOT use Markdown heading markers (#, ##, ###), horizontal divider lines (---, ___, or repeated dashes), decorative separators, or LaTeX delimiters. Do not begin or end sections with lines of symbols. Use plain section titles on their own line, followed by a short paragraph or a few bullets. Avoid decorative Unicode and emoji unless the subject truly requires them. For high-school and beginner answers, write chemical formulas with ordinary keyboard characters (H2O, CO2, O2, C6H12O6), explain technical terms in plain language, and describe equations in words first. Prefer simple text equations such as 'Carbon dioxide + water + light -> sugar + oxygen'. Use ASCII arrows '->' rather than special arrow glyphs when possible. Never use Markdown tables. Use short labeled bullets instead. Never insert horizontal rules or rows of dashes between sections. Avoid dense academic prose and unnecessary jargon. Keep paragraphs short. Aim for a calm, uncluttered page that looks like well-organized class notes. For study guides, prioritize key ideas, process steps, common mistakes, and a short recap. For practice, number questions and put answers in a separate answer key. Use formal scientific notation only when the learner's level or task requires it, and explain it. Be accurate, distinguish uncertainty, and never pretend to know the student's course rubric. Support learning rather than doing a graded assessment dishonestly.`;
    try {
      const answer = await askVant(
        "You are VANT Study Assistant, a patient and accurate learning coach. Help students understand material, practice skills, and study independently. Make responses feel as polished and readable as VANT Main Chat, using standard Markdown headings, short paragraphs, bullets, numbered steps, and equations when useful. Keep the format uncluttered and appropriate to the learner. For beginner and high-school learners, explain formulas and equations in plain language. Do not fabricate facts or citations. If a question depends on missing class material, say what is missing.",
        [{ role: "user", content: prompt }]
      );
      if (typeof answer === "string" && answer.trim()) setResult(answer.trim());
      else setError("VANT couldn't generate study help. Please try again.");
    } catch {
      setError("Something went wrong generating study help. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const fieldStyle = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: `1px solid ${theme.borderStrong}`, background: theme.inputBg, color: theme.text, fontSize: 14, outline: "none" };
  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto", color: theme.text }}>
      <BackBar title="AI Study Assistant" accentKey="violet" isDark={isDark} theme={theme} onBack={onBack} />
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1.5, color: ac("violet", isDark), margin: "0 0 8px" }}>STUDENTS & LEARNING</p>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 30, fontWeight: 500, margin: "0 0 8px" }}>Let's make this easier to understand.</h1>
        <p style={{ color: theme.textMuted, lineHeight: 1.6, margin: "0 0 22px" }}>Get an explanation, build a study guide, or practice a topic with VANT. Add your class notes for more relevant help.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, padding: 20, border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.surfaceCard }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, color: theme.textMuted }}>
            Subject or topic *
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Photosynthesis, algebra..." style={fieldStyle} maxLength={240} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, color: theme.textMuted }}>
            Study level
            <select value={level} onChange={(e) => setLevel(e.target.value)} style={fieldStyle}>
              {["Elementary", "Middle school", "High school", "College / University", "Professional learning"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, color: theme.textMuted, gridColumn: "1 / -1" }}>
            What do you need?
            <select value={goal} onChange={(e) => setGoal(e.target.value)} style={fieldStyle}>
              {["Explain a topic", "Create a study guide", "Summarize my notes", "Give me practice questions", "Explain a problem step by step"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, color: theme.textMuted, gridColumn: "1 / -1" }}>
            Class notes or extra context (optional)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste notes, a question, or the part you find confusing..." rows={5} maxLength={12000} style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.5 }} />
          </label>
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={generateStudyHelp} disabled={!subject.trim() || loading} style={{ border: "none", borderRadius: 10, padding: "11px 16px", background: !subject.trim() || loading ? theme.surfaceStrong : ac("violet", isDark), color: !subject.trim() || loading ? theme.textFaint : (isDark ? "#171323" : "#FFFFFF"), fontWeight: 600, cursor: !subject.trim() || loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              {loading ? <><RefreshCw size={15} className="v-pulse" /> Working...</> : <><Sparkles size={15} /> Generate study help</>}
            </button>
          </div>
        </div>
        {error && <p role="alert" style={{ color: ac("red", isDark), marginTop: 16 }}>{error}</p>}
        {result && <section style={{ marginTop: 20, padding: 22, border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.surfaceCard }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Your study help</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" onClick={async () => setSaveMessage((await saveStudyMaterialToDevice({ title: subject.trim() + " — " + goal, type: "study-assistant", topic: subject, content: result, sourceNotes: notes, userId: user?.isGuest ? null : user?.id })).message)} style={{ border: 0, background: ac("violet", isDark), color: isDark ? "#171323" : "#FFFFFF", padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 650 }}>Save Study Material</button><button type="button" onClick={() => { if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) navigator.clipboard.writeText(result).catch(() => {}); }} style={{ border: `1px solid ${theme.borderStrong}`, background: theme.surface, color: theme.text, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Copy answer</button></div>
          </div>
          {saveMessage && <p role="status" style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 12px" }}>{saveMessage}</p>}
          <VantMarkdown source={result} theme={theme} isDark={isDark} />
        </section>}
        <p style={{ fontSize: 12, color: theme.textFaint, lineHeight: 1.6, marginTop: 16 }}>Check important facts against your course materials. VANT is a study aid, not a substitute for your teacher's instructions or official course requirements.</p>
      </div>
    </div>
  );
}



export function NotesStudyGuideTool({ onBack, onCreateFlashcards, theme, isDark, user }) {
  const [notes, setNotes] = useState("");
  const [focus, setFocus] = useState("");
  const [subject, setSubject] = useState("");
  const [level, setLevel] = useState("High school");
  const [style, setStyle] = useState("study-guide");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openSections, setOpenSections] = useState({});
  const [copied, setCopied] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  const styles = [
    { id: "study-guide", title: "Structured study guide", description: "Key ideas, terms, processes, and a recap.", icon: BookOpen },
    { id: "summary", title: "Concise summary", description: "The most important points, without extra detail.", icon: FileText },
    { id: "exam-sheet", title: "Exam revision sheet", description: "Priority facts, review prompts, and common mistakes.", icon: Target },
    { id: "concept-breakdown", title: "Concept breakdown", description: "Explain difficult ideas in manageable steps.", icon: Sparkles },
  ];
  const selectedStyle = styles.find((item) => item.id === style) || styles[0];
  const fieldStyle = {
    width: "100%", boxSizing: "border-box", padding: "12px 13px", borderRadius: 11,
    border: "1px solid " + theme.borderStrong, background: theme.inputBg, color: theme.text,
    fontSize: 14, outline: "none", fontFamily: "'DM Sans', system-ui, sans-serif",
  };

  function parseSections(text) {
    const knownHeadings = /^(source-based content|from your notes|source-derived facts|ai explanations|helpful explanations|extra context|important terms|key terms|processes and steps|common mistakes|common misconceptions|review questions|quick recap|summary|main takeaways|exam essentials|concept breakdown|step-by-step explanation|what to remember|missing or unclear in the notes)\s*:?\s*$/i;
    const lines = String(text || "").split(/\r?\n/);
    const sections = [];
    let current = { title: "Study material", body: [] };
    for (const line of lines) {
      const clean = line.trim().replace(/^#{1,4}\s*/, "").replace(/\*\*/g, "");
      if (knownHeadings.test(clean)) {
        if (current.body.join("\n").trim()) sections.push({ title: current.title, body: current.body.join("\n").trim() });
        current = { title: clean.replace(/:$/, ""), body: [] };
      } else {
        current.body.push(line);
      }
    }
    if (current.body.join("\n").trim()) sections.push({ title: current.title, body: current.body.join("\n").trim() });
    return sections.length ? sections : [{ title: "Study material", body: String(text || "").trim() }];
  }

  const sections = result ? parseSections(result) : [];

  async function generate() {
    if (!notes.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult("");
    setOpenSections({});
    setCopied(false);
    setSaveMessage("");
    const styleInstructions = {
      "study-guide": "Create a structured study guide with key ideas, important terms, processes or steps, common mistakes, review questions, and a short recap.",
      "summary": "Create a concise summary of the source notes. Prioritize central ideas and essential details. Keep it shorter than the original notes.",
      "exam-sheet": "Create an exam revision sheet. Prioritize exam essentials, key facts and definitions in the notes, practice review questions based on the material, and common mistakes to avoid.",
      "concept-breakdown": "Break the material into manageable concepts. Explain each concept in plain language, show how concepts connect, and walk through processes step by step where relevant.",
    }[style];
    const prompt = "Turn the student's pasted class notes into learning material.\nOutput style: " + selectedStyle.title +
      ".\nSubject or class: " + (subject.trim() || "Not specified") +
      ".\nLearner level: " + level +
      ".\nFocus request: " + (focus.trim() || "Cover the most important ideas in the notes") +
      ".\n\nSOURCE NOTES (primary source; do not replace with a generic article):\n<student_notes>\n" + notes.trim() +
      "\n</student_notes>\n\nTask: " + styleInstructions +
      "\n\nUse these exact section labels where relevant:\nSOURCE-BASED CONTENT\nIMPORTANT TERMS\nAI EXPLANATIONS\nPROCESSES AND STEPS\nCOMMON MISTAKES\nREVIEW QUESTIONS\nQUICK RECAP\nMISSING OR UNCLEAR IN THE NOTES" +
      "\n\nRules:\n- SOURCE-BASED CONTENT contains only facts, claims, definitions, and details supported by the pasted notes. Preserve the source meaning and terminology." +
      "\n- AI EXPLANATIONS may clarify difficult ideas, add clearly identified examples, or explain connections. Never present added explanation as if it came from the source." +
      "\n- Label added context as an AI explanation or extra context." +
      "\n- If something is unclear or absent, say so instead of inventing course-specific facts." +
      "\n- Skip irrelevant sections. Use short paragraphs and simple bullets. No tables, decorative dividers, or walls of text." +
      "\n- Do not claim to predict an actual exam; review questions are practice prompts based on the supplied notes.";
    try {
      const answer = await askVant(
        "You are VANT Study Tools, a careful learning assistant. The learner's supplied notes are the primary source. Distinguish source-supported information from your own explanations, never invent details supposedly found in the source, and use clear section labels exactly as requested.",
        [{ role: "user", content: prompt }]
      );
      if (typeof answer === "string" && answer.trim()) setResult(answer.trim());
      else setError("VANT couldn't generate the study material. Please try again.");
    } catch {
      setError("Something went wrong generating your study material. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyResult() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(result);
        setCopied(true);
      }
    } catch {
      setError("Copying isn't available in this browser. You can still select and copy the study material.");
    }
  }

  const isSourceSection = (title) => /source|from your notes|source-derived/i.test(title);
  const isExplanationSection = (title) => /ai explanation|helpful explanation|extra context/i.test(title);

  return (
    <div style={{ padding: "24px clamp(16px, 3vw, 32px) 36px", minHeight: "100%", color: theme.text }}>
      <BackBar title="Notes Summarizer & Study-Guide Generator" accentKey="cyan" isDark={isDark} theme={theme} onBack={onBack} />
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap", margin: "10px 0 22px" }}>
          <div style={{ maxWidth: 680 }}>
            <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1.5, color: ac("cyan", isDark), margin: "0 0 8px" }}>STUDENTS & LEARNING · TOOL 01</p>
            <h1 style={{ fontFamily: "Fraunces, serif", fontSize: "clamp(27px, 3vw, 36px)", lineHeight: 1.15, fontWeight: 500, margin: "0 0 10px" }}>Make your notes easier to learn.</h1>
            <p style={{ color: theme.textMuted, lineHeight: 1.65, fontSize: 14, margin: 0 }}>Paste your class notes. VANT will organize what you provided, explain difficult ideas separately, and shape the material around your goal.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", border: "1px solid " + theme.border, borderRadius: 12, background: theme.surface, color: theme.textMuted, fontSize: 12 }}>
            <BookOpen size={16} color={ac("cyan", isDark)} /> Your notes stay the primary source
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: 18, alignItems: "start" }}>
          <section style={{ minWidth: 0, border: "1px solid " + theme.border, borderRadius: 18, padding: "20px clamp(15px, 2vw, 22px)", background: theme.surfaceCard, boxShadow: isDark ? "none" : "0 8px 28px rgba(30,25,50,0.035)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: acBg("cyan", isDark), color: ac("cyan", isDark) }}><FileText size={18} /></div>
              <div><h2 style={{ fontSize: 16, margin: 0, fontWeight: 650 }}>Your class notes</h2><p style={{ color: theme.textMuted, fontSize: 12, margin: "4px 0 0" }}>Paste the material you want to study</p></div>
            </div>
            <label style={{ display: "block", color: theme.textMuted, fontSize: 12.5, marginBottom: 7 }}>Notes <span style={{ color: ac("red", isDark) }}>*</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={"Paste lecture notes, textbook excerpts, or your own class notes here…\n\nTip: Keep headings and bullet points if you have them."} rows={12} maxLength={30000} style={{ ...fieldStyle, minHeight: 240, resize: "vertical", lineHeight: 1.65 }} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, color: theme.textFaint, fontSize: 11, marginTop: 6 }}>
              <span>Your supplied material is the starting point.</span><span>{notes.length.toLocaleString()} / 30,000</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 18 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 7, color: theme.textMuted, fontSize: 12.5 }}>Subject or class <span style={{ color: theme.textFaint, fontSize: 11 }}>Optional</span>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Biology" maxLength={160} style={fieldStyle} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 7, color: theme.textMuted, fontSize: 12.5 }}>Learning level
                <select value={level} onChange={(e) => setLevel(e.target.value)} style={fieldStyle}>{["Elementary", "Middle school", "High school", "College / University", "Professional learning"].map((item) => <option key={item} value={item}>{item}</option>)}</select>
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 7, color: theme.textMuted, fontSize: 12.5, marginTop: 14 }}>What should VANT focus on? <span style={{ color: theme.textFaint, fontSize: 11 }}>Optional</span>
              <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="e.g. Explain the stages, definitions, and differences" maxLength={500} style={fieldStyle} />
            </label>
            <div style={{ marginTop: 20 }}>
              <div style={{ color: theme.text, fontSize: 13, fontWeight: 650, marginBottom: 10 }}>Choose an output style</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 9 }}>
                {styles.map((item) => {
                  const Icon = item.icon;
                  const active = style === item.id;
                  return <button key={item.id} type="button" onClick={() => setStyle(item.id)} aria-pressed={active} style={{ minHeight: 112, padding: 12, textAlign: "left", borderRadius: 12, border: "1px solid " + (active ? ac("violet", isDark) : theme.border), background: active ? acBg("violet", isDark) : theme.surface, color: theme.text, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 7 }}>
                    <Icon size={17} color={active ? ac("violet", isDark) : theme.textMuted} />
                    <span style={{ fontSize: 12.5, lineHeight: 1.35, fontWeight: 650 }}>{item.title}</span>
                    <span style={{ fontSize: 11, lineHeight: 1.45, color: theme.textMuted }}>{item.description}</span>
                  </button>;
                })}
              </div>
            </div>
            {error && <p role="alert" style={{ color: ac("red", isDark), fontSize: 13, lineHeight: 1.5, margin: "14px 0 0" }}>{error}</p>}
            <button type="button" onClick={generate} disabled={!notes.trim() || loading} style={{ width: "100%", marginTop: 18, minHeight: 46, border: 0, borderRadius: 12, padding: "12px 16px", background: !notes.trim() || loading ? theme.surfaceStrong : "linear-gradient(110deg, " + ac("violet", isDark) + ", " + ac("cyan", isDark) + ")", color: !notes.trim() || loading ? theme.textFaint : (isDark ? "#171323" : "#FFFFFF"), fontWeight: 700, cursor: !notes.trim() || loading ? "not-allowed" : "pointer", display: "flex", justifyContent: "center", alignItems: "center", gap: 9 }}>
              {loading ? <><RefreshCw size={16} className="v-pulse" /> Organizing your notes…</> : <><Sparkles size={16} /> Create {selectedStyle.title.toLowerCase()}</>}
            </button>
          </section>

          <section style={{ minWidth: 0, border: "1px solid " + theme.border, borderRadius: 18, padding: "20px clamp(15px, 2vw, 22px)", background: theme.surfaceCard, minHeight: 440, boxShadow: isDark ? "none" : "0 8px 28px rgba(30,25,50,0.035)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: acBg("violet", isDark), color: ac("violet", isDark) }}><Sparkles size={18} /></div>
                <div><h2 style={{ fontSize: 16, margin: 0, fontWeight: 650 }}>Your study workspace</h2><p style={{ color: theme.textMuted, fontSize: 12, margin: "4px 0 0" }}>{result ? selectedStyle.title : "Your organized material will appear here"}</p></div>
              </div>
              {result && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button type="button" onClick={async () => setSaveMessage((await saveStudyMaterialToDevice({ title: (subject.trim() ? subject.trim() + " — " : "") + selectedStyle.title, type: "notes-study-guide", topic: subject || focus, content: result, sourceNotes: notes, userId: user?.isGuest ? null : user?.id })).message)} style={{ border: 0, background: ac("violet", isDark), color: isDark ? "#171323" : "#FFFFFF", padding: "8px 11px", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 650, display: "flex", alignItems: "center", gap: 6 }}><BookOpen size={14} /> Save Study Material</button><button type="button" onClick={() => onCreateFlashcards?.(notes, subject)} disabled={!notes.trim()} style={{ border: 0, background: "linear-gradient(110deg, " + ac("violet", isDark) + ", " + ac("cyan", isDark) + ")", color: isDark ? "#171323" : "#FFFFFF", padding: "8px 11px", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 650, display: "flex", alignItems: "center", gap: 6 }}><GraduationCap size={14} /> Make flashcards from notes</button><button type="button" onClick={copyResult} style={{ border: "1px solid " + theme.borderStrong, background: theme.surface, color: theme.text, padding: "8px 11px", borderRadius: 9, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><Copy size={14} /> {copied ? "Copied" : "Copy all"}</button></div>}
            </div>
            {!result && !loading && <div style={{ minHeight: 330, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24, border: "1px dashed " + theme.borderStrong, borderRadius: 14, background: theme.surface }}>
              <div style={{ width: 54, height: 54, borderRadius: 17, display: "grid", placeItems: "center", background: acBg("cyan", isDark), color: ac("cyan", isDark), marginBottom: 15 }}><BookOpen size={25} /></div>
              <h3 style={{ fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 500, margin: "0 0 8px" }}>Ready when you are.</h3>
              <p style={{ maxWidth: 310, color: theme.textMuted, fontSize: 13, lineHeight: 1.65, margin: 0 }}>Paste your notes, choose a format, and VANT will organize them into sections you can open and close.</p>
              <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 7, marginTop: 18 }}>
                {["Source-based content", "AI explanations", "Collapsible sections"].map((label) => <span key={label} style={{ fontSize: 11, border: "1px solid " + theme.border, borderRadius: 999, padding: "6px 9px", color: theme.textMuted }}>{label}</span>)}
              </div>
            </div>}
            {loading && <div role="status" aria-live="polite" style={{ minHeight: 330, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", color: theme.textMuted }}>
              <RefreshCw size={26} className="v-pulse" color={ac("violet", isDark)} />
              <p style={{ margin: "14px 0 5px", color: theme.text, fontWeight: 650 }}>Building your study material</p>
              <p style={{ margin: 0, fontSize: 12.5 }}>Keeping your notes separate from extra explanations.</p>
            </div>}
            {result && <div>
              {saveMessage && <p role="status" style={{ fontSize: 12, color: theme.textMuted, margin: "0 0 12px" }}>{saveMessage}</p>}
              <div style={{ padding: "11px 13px", borderRadius: 11, background: theme.surface, border: "1px solid " + theme.border, marginBottom: 12, display: "flex", alignItems: "flex-start", gap: 9 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: ac("green", isDark), marginTop: 5, flexShrink: 0 }} />
                <p style={{ margin: 0, color: theme.textMuted, fontSize: 12, lineHeight: 1.55 }}>Source-based sections reflect the notes you pasted. AI explanation sections may add clarifying context and are labeled separately.</p>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {sections.map((section, index) => {
                  const open = openSections[index] ?? true;
                  const sourceSection = isSourceSection(section.title);
                  const explanationSection = isExplanationSection(section.title);
                  const accent = sourceSection ? "cyan" : explanationSection ? "violet" : "green";
                  const Icon = sourceSection ? FileText : explanationSection ? Sparkles : BookOpen;
                  return <article key={section.title + "-" + index} style={{ border: "1px solid " + theme.border, borderRadius: 13, overflow: "hidden", background: theme.surface }}>
                    <button type="button" aria-expanded={open} onClick={() => setOpenSections((current) => ({ ...current, [index]: !open }))} style={{ width: "100%", padding: "13px 14px", border: 0, background: "transparent", color: theme.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
                      <span style={{ width: 29, height: 29, borderRadius: 9, background: acBg(accent, isDark), color: ac(accent, isDark), display: "grid", placeItems: "center", flexShrink: 0 }}><Icon size={15} /></span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 650 }}>{section.title}</span>
                      {(sourceSection || explanationSection) && <span style={{ fontSize: 10.5, color: ac(accent, isDark), border: "1px solid " + ac(accent, isDark) + "55", borderRadius: 999, padding: "4px 7px" }}>{sourceSection ? "From your notes" : "AI explanation"}</span>}
                      {open ? <ChevronRight size={16} style={{ transform: "rotate(90deg)", color: theme.textMuted }} /> : <ChevronRight size={16} color={theme.textMuted} />}
                    </button>
                    {open && <div style={{ padding: "0 16px 16px 53px", color: theme.textMuted, fontSize: 13.5, lineHeight: 1.75, overflowWrap: "anywhere" }}><VantMarkdown source={section.body} theme={theme} isDark={isDark} /></div>}
                  </article>;
                })}
              </div>
            </div>}
            <p style={{ fontSize: 11.5, color: theme.textFaint, lineHeight: 1.55, margin: "18px 0 0" }}>Use this as a study aid and verify important details against your teacher's instructions and original course materials.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function StudyResourceTool({ mode, onBack, theme, isDark, initialNotes = "", initialTopic = "", user }) {
  const configs = {
    practice: { title: "Flashcard & Practice-Quiz Generator", intro: "Create flashcards or a practice quiz from a topic or your own class notes.", accent: "violet", button: "Generate study practice" },
    planner: { title: "Study Planner & Assignment Tracker", intro: "Plan study sessions, track assignment deadlines, and organize your workload.", accent: "green", button: "Build my study plan" },
    notes: { title: "Notes Summarizer & Study-Guide Generator", intro: "Turn class notes into clear summaries, key ideas, and a focused study guide.", accent: "cyan", button: "Create study guide" },
    essay: { title: "Essay Outline & Writing Assistant", intro: "Organize a thesis, arguments, evidence, and a clear essay structure.", accent: "violet", button: "Build essay outline" },
    citation: { title: "Citation & Bibliography Formatter", intro: "Organize source details and format references in a selected citation style.", accent: "amber", button: "Format references" },
    math: { title: "Math & Formula Explainer", intro: "Understand formulas and work through problems one step at a time.", accent: "green", button: "Explain step by step" },
    presentation: { title: "Presentation & Report Generator", intro: "Turn your topic, notes, or research into a structured report or presentation outline.", accent: "cyan", button: "Generate outline" },
    research: { title: "Research Paper Organizer", intro: "Organize your research question, sources, notes, evidence, and paper sections.", accent: "amber", button: "Organize research" },
  };
  const config = configs[mode] || configs.practice;
  const [topic, setTopic] = useState(initialTopic);
  const [level, setLevel] = useState("High school");
  const [quantity, setQuantity] = useState("12");
  const [format, setFormat] = useState("Flashcards");
  const [notes, setNotes] = useState(initialNotes);
  const [examDate, setExamDate] = useState("");
  const [hours, setHours] = useState("5");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [studyData, setStudyData] = useState(null);
  const [saveMessage, setSaveMessage] = useState("");
  const fieldStyle = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 10, border: `1px solid ${theme.borderStrong}`, background: theme.inputBg, color: theme.text, fontSize: 14, outline: "none" };

  async function generate() {
    if (!topic.trim() || loading) return;
    setLoading(true); setError(""); setResult(""); setStudyData(null); setSaveMessage("");
    let task = "";
    if (mode === "practice" && format === "Flashcards") task = `Create ${quantity} useful study flashcards about: ${topic.trim()}. Level: ${level}. Return only JSON with shape {"type":"flashcards","title":"title","cards":[{"front":"question","back":"answer","topic":"topic"}]}. Include exactly ${quantity} cards, one idea per card. Use provided notes: ${notes.trim() || "No notes supplied; use general knowledge."}. No Markdown fences.`;
    if (mode === "practice" && format === "Practice quiz") task = `Create a ${quantity}-question quiz about: ${topic.trim()}. Level: ${level}. Return only JSON with shape {"type":"quiz","title":"title","questions":[{"question":"question","options":[{"id":"A","text":"choice"},{"id":"B","text":"choice"},{"id":"C","text":"choice"},{"id":"D","text":"choice"}],"correctAnswer":"A","explanation":"why","topic":"topic"}]}. Include exactly ${quantity} questions, four options each, one correct option id. Use provided notes: ${notes.trim() || "No notes supplied; use general knowledge."}. No Markdown fences.`;
    if (mode === "planner") task = `Create a realistic, actionable study plan and assignment tracker for these topics, goals, and assignments: ${topic.trim()}. Level: ${level}. Target date: ${examDate || "not specified"}. Available study time: ${hours} hours per week. Notes and constraints: ${notes.trim() || "none provided"}. Return a polished VANT Main Chat-style Markdown document, not a dense paragraph or generic essay. Use this structure and adapt it to the information provided:\n# Study Plan: [specific title]\n## Goal & Priorities\nSummarize the goal and list the highest-priority work first.\n## Weekly Study Schedule\nUse a compact Markdown table with columns Day/Date, Study session, Duration, and Outcome. Keep sessions within the weekly time budget and use actual dates only when grounded in the target date or supplied deadlines.\n## Assignment Tracker\nUse Markdown task checkboxes (- [ ]) with task, due date (write “Not provided” when missing), and priority. Do not invent deadlines.\n## Milestones & Review\nList manageable milestones, active-recall practice, spaced review, and short breaks.\n## Next Actions\nGive 3 concrete actions to start with.\nIf no target date is provided, make a flexible one-week starter plan and include a reusable blank assignment checklist. Preserve all important constraints from the user. Make recommendations practical and specific, distinguish suggested dates from supplied deadlines, and never invent missing assignment details.`;
    if (mode === "notes") task = `Summarize these notes and create a study guide. Topic: ${topic.trim()}. Level: ${level}. Source notes:\n${notes.trim() || "No notes were provided; create a general guide on the topic and label it as general background."}\nOrganize key ideas, important terms with simple definitions, processes or steps, likely review questions, common misconceptions, and a short recap. Clearly distinguish source-note content from any general background.`;
    if (mode === "essay") task = `Help plan and improve an essay. Topic or assignment prompt: ${topic.trim()}. Level: ${level}. Student draft, rubric, required sources, or instructions:\n${notes.trim() || "No additional instructions supplied."}\nProvide a working thesis or thesis-development prompts, a logical outline, main arguments, evidence needed for each argument, transitions, and a revision checklist. Do not invent quotations, sources, or rubric requirements. Help the student develop their own work rather than misrepresent authorship.`;
    if (mode === "citation") task = `Format citations and a bibliography. Topic or citation request: ${topic.trim()}. Requested style: ${format}. Source details supplied by the student:\n${notes.trim() || "No source details supplied."}\nFormat only fields supported by the provided details. List missing fields and any style-specific uncertainties; never invent authors, titles, dates, publishers, DOIs, URLs, or page numbers. If source details are insufficient, show a fill-in template rather than fabricating a complete citation.`;
    if (mode === "math") task = `Explain this math problem, formula, or concept step by step: ${topic.trim()}. Learner level: ${level}. Additional work or context:\n${notes.trim() || "No additional work supplied."}\nState what is being asked, define symbols and units, show each reasoning step, verify the result where possible, and explain a common mistake. Use plain-text equations where possible. If the problem is missing values or conditions, ask for them instead of guessing.`;
    if (mode === "presentation") task = `Create a presentation outline and/or report structure for: ${topic.trim()}. Audience and level: ${level}. Desired format: ${format}. Source notes and requirements:\n${notes.trim() || "No additional notes supplied."}\nProvide a clear title, purpose, ordered sections or slides, key points, evidence or visuals to consider, speaker notes or report paragraphs as appropriate, conclusion, and a source-check checklist. Do not invent data, quotations, or sources. Clearly label suggestions versus facts supplied by the student.`;
    if (mode === "research") task = `Organize a research paper project. Research topic or question: ${topic.trim()}. Level: ${level}. Citation style preference: ${format}. Sources, notes, requirements, and deadlines:\n${notes.trim() || "No additional details supplied."}\nProvide a refined research question, scope, paper outline, source log template, evidence/claim matrix, open questions, and next-step checklist. Do not invent source contents or citations; identify evidence gaps and distinguish source facts from hypotheses.`;
    const fullPrompt = `${task}\n\nFormat the answer like a polished VANT Main Chat response using standard readable Markdown: clear headings where helpful, short paragraphs, bullets, numbered steps, and tables only when they genuinely improve clarity. Use bold for key terms and preserve useful structure. Avoid decorative divider lines and dense walls of text. Be accurate, tailor difficulty to the selected level, and do not invent details from course materials that were not provided.`;
    try {
      const studySystem = mode === "practice" ? "You are VANT Study Tools. For flashcards and quizzes, output ONLY one valid JSON object with no Markdown fences and no extra text. Flashcards shape: {\"type\":\"flashcards\",\"title\":\"title\",\"cards\":[{\"front\":\"question\",\"back\":\"answer\",\"topic\":\"topic\"}]}. Quiz shape: {\"type\":\"quiz\",\"title\":\"title\",\"questions\":[{\"question\":\"question\",\"options\":[{\"id\":\"A\",\"text\":\"choice\"},{\"id\":\"B\",\"text\":\"choice\"},{\"id\":\"C\",\"text\":\"choice\"},{\"id\":\"D\",\"text\":\"choice\"}],\"correctAnswer\":\"A\",\"explanation\":\"why\",\"topic\":\"topic\"}]}. Match the requested quantity." : "You are VANT Study Tools, a patient and accurate learning assistant. Use polished readable Markdown when useful. Never fabricate facts, citations, source details, or assignment requirements. Clearly state missing information and uncertainty.";
      const answer = await askVant(studySystem, [{ role: "user", content: fullPrompt }]);
      if (typeof answer === "string" && answer.trim()) {
        if (mode === "practice") {
          try {
            const cleaned = answer.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
            const firstObject = cleaned.indexOf("{");
            const lastObject = cleaned.lastIndexOf("}");
            const parsed = JSON.parse(firstObject >= 0 && lastObject > firstObject ? cleaned.slice(firstObject, lastObject + 1) : cleaned);
            if (format === "Flashcards" && parsed.type === "flashcards" && Array.isArray(parsed.cards) && parsed.cards.length) setStudyData(parsed);
            else if (format === "Practice quiz" && parsed.type === "quiz" && Array.isArray(parsed.questions) && parsed.questions.length && parsed.questions.every((q) => Array.isArray(q.options) && q.options.length >= 2 && q.options.some((o) => o.id === q.correctAnswer))) setStudyData(parsed);
            else throw new Error("Invalid interactive study format");
            setResult(JSON.stringify(parsed, null, 2));
          } catch { setError("VANT returned a format we could not turn into interactive study material. Please try again."); }
        } else setResult(answer.trim());
      } else setError("VANT could not generate this study material. Please try again.");
    } catch {
      setError("Something went wrong generating this study material. Please try again.");
    } finally { setLoading(false); }
  }

  const isPlanner = mode === "planner";
  const usesNotes = ["planner", "notes", "essay", "citation", "math", "presentation", "research"].includes(mode);
  const showQuantity = mode === "practice";
  const showFormat = ["practice", "citation", "presentation", "research"].includes(mode);

  return (
    <div style={{ padding: 28, height: "100%", overflowY: "auto", color: theme.text }}>
      <BackBar title={config.title} accentKey={config.accent} isDark={isDark} theme={theme} onBack={onBack} />
      <div style={{ maxWidth: 820, margin: "0 auto" }}>
        <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 1.5, color: ac(config.accent, isDark), margin: "0 0 8px" }}>STUDENTS & LEARNING</p>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: 30, fontWeight: 500, margin: "0 0 8px" }}>{config.title}</h1>
        <p style={{ color: theme.textMuted, lineHeight: 1.6, margin: "0 0 22px" }}>{config.intro}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, padding: 20, border: `1px solid ${theme.border}`, borderRadius: 16, background: theme.surfaceCard }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, color: theme.textMuted, gridColumn: "1 / -1" }}>
            {isPlanner ? "Topics, assignments, and study goals *" : mode === "citation" ? "Citation request or source topic *" : mode === "math" ? "Problem, formula, or concept *" : mode === "essay" ? "Essay prompt or topic *" : mode === "research" ? "Research topic or question *" : "Subject or topic *"}
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={isPlanner ? "e.g. Biology exam, history essay due Friday..." : "e.g. Photosynthesis, algebra, Philippine history..."} style={fieldStyle} maxLength={2000} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, color: theme.textMuted }}>
            Study level
            <select value={level} onChange={(e) => setLevel(e.target.value)} style={fieldStyle}>{["Elementary", "Middle school", "High school", "College / University", "Professional learning"].map((item) => <option key={item}>{item}</option>)}</select>
          </label>
          {showQuantity && <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, color: theme.textMuted }}>
            Number of cards/questions
            <select value={quantity} onChange={(e) => setQuantity(e.target.value)} style={fieldStyle}>{["5", "10", "12", "15", "20"].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>}
          {showFormat && <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, color: theme.textMuted }}>
            {mode === "practice" ? "Create" : mode === "citation" || mode === "research" ? "Citation style" : "Output format"}
            <select value={format} onChange={(e) => setFormat(e.target.value)} style={fieldStyle}>
              {(mode === "practice" ? ["Flashcards", "Practice quiz"] : mode === "citation" || mode === "research" ? ["APA 7th edition", "MLA 9th edition", "Chicago", "IEEE", "Not sure"] : ["Presentation outline", "Written report", "Both outline and report"]).map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>}
          {isPlanner && <>
            <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, color: theme.textMuted }}>Target date (optional)<input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} style={fieldStyle} /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, color: theme.textMuted }}>Study hours per week<select value={hours} onChange={(e) => setHours(e.target.value)} style={fieldStyle}>{["2", "3", "5", "7", "10", "14", "20"].map((n) => <option key={n} value={n}>{n} hours</option>)}</select></label>
          </>}
          {usesNotes && <label style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13, color: theme.textMuted, gridColumn: "1 / -1" }}>
            {mode === "planner" ? "Assignment details and schedule constraints (optional)" : mode === "notes" ? "Class notes or source material (optional)" : mode === "citation" ? "Source details (author, title, date, URL/DOI, publisher, etc.)" : "Notes, source material, or extra context (optional)"}
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={mode === "citation" ? "Paste the source details you have; missing details will be flagged, not invented." : "Paste notes, assignment instructions, source details, or your current work..."} rows={5} maxLength={12000} style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.5 }} />
          </label>}
          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={generate} disabled={!topic.trim() || loading} style={{ border: "none", borderRadius: 10, padding: "11px 16px", background: !topic.trim() || loading ? theme.surfaceStrong : ac(config.accent, isDark), color: !topic.trim() || loading ? theme.textFaint : (isDark ? "#171323" : "#FFFFFF"), fontWeight: 600, cursor: !topic.trim() || loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              {loading ? <><RefreshCw size={15} className="v-pulse" /> Working...</> : <><Sparkles size={15} /> {config.button}</>}
            </button>
          </div>
        </div>
        {error && <p role="alert" style={{ color: ac("red", isDark), marginTop: 16 }}>{error}</p>}
        {result && <section style={{ marginTop: 20, padding: 22, border: "1px solid " + theme.border, borderRadius: 16, background: theme.surfaceCard }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Your result</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={async () => setSaveMessage((await saveStudyMaterialToDevice({ title: (studyData && studyData.title) || config.title + " — " + topic.trim(), type: studyData ? studyData.type : mode, topic, content: result, sourceNotes: notes, userId: user?.isGuest ? null : user?.id })).message)} style={{ border: "none", background: ac(config.accent, isDark), color: isDark ? "#171323" : "#FFFFFF", padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 650 }}>Save Study Material</button>
              <button type="button" onClick={() => { if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) navigator.clipboard.writeText(result).catch(() => {}); }} style={{ border: "1px solid " + theme.borderStrong, background: theme.surface, color: theme.text, padding: "7px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Copy answer</button>
            </div>
          </div>
          {saveMessage && <p role="status" style={{ fontSize: 12, color: theme.textMuted }}>{saveMessage}</p>}
          {studyData && <InteractivePracticeView studyData={studyData} theme={theme} isDark={isDark} accent={config.accent} topic={topic} />}
          {!studyData && <VantMarkdown source={result} theme={theme} isDark={isDark} />}
        </section>}
        <p style={{ fontSize: 12, color: theme.textFaint, lineHeight: 1.6, marginTop: 16 }}>Review generated material against your class notes, source details, and teacher's instructions.</p>
      </div>
    </div>
  );
}


function InteractivePracticeView({ studyData, theme, isDark, accent, topic }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState({});
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const buttonStyle = { border: "1px solid " + theme.borderStrong, background: theme.surface, color: theme.text, padding: "9px 12px", borderRadius: 9, cursor: "pointer" };
  if (studyData.type === "flashcards") {
    const cards = studyData.cards;
    const card = cards[Math.min(index, cards.length - 1)];
    return <div>
      <p style={{ color: theme.textMuted, fontSize: 13 }}>Click the card to flip it. Mark cards you know or want to review.</p>
      <button type="button" onClick={() => setFlipped(!flipped)} style={{ width: "100%", minHeight: 220, padding: 26, borderRadius: 16, border: "1px solid " + ac(accent, isDark), background: acBg(accent, isDark), color: theme.text, textAlign: "left", cursor: "pointer" }}>
        <span style={{ display: "block", color: ac(accent, isDark), fontSize: 11, letterSpacing: 1.2, marginBottom: 18 }}>{flipped ? "ANSWER" : "FLASHCARD " + (index + 1) + " OF " + cards.length}</span>
        <span style={{ display: "block", fontSize: 20, lineHeight: 1.5, fontWeight: 600 }}>{flipped ? card.back : card.front}</span>
        {card.topic && <span style={{ display: "block", color: theme.textMuted, fontSize: 12, marginTop: 18 }}>Topic: {card.topic}</span>}
        <span style={{ display: "block", color: theme.textMuted, fontSize: 12, marginTop: 14 }}>Click to {flipped ? "see question" : "reveal answer"}</span>
      </button>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" disabled={index === 0} onClick={() => { setIndex(index - 1); setFlipped(false); }} style={{ ...buttonStyle, opacity: index === 0 ? 0.5 : 1 }}>Previous</button>
        <span style={{ color: theme.textMuted, fontSize: 12 }}>{Object.values(known).filter(Boolean).length} known · {Object.values(known).filter((v) => v === false).length} to review</span>
        <button type="button" disabled={index >= cards.length - 1} onClick={() => { setIndex(index + 1); setFlipped(false); }} style={{ ...buttonStyle, opacity: index >= cards.length - 1 ? 0.5 : 1 }}>Next</button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button type="button" onClick={() => setKnown({ ...known, [index]: true })} style={buttonStyle}>I know this</button>
        <button type="button" onClick={() => setKnown({ ...known, [index]: false })} style={buttonStyle}>Review again</button>
      </div>
    </div>;
  }
  const questions = studyData.questions;
  const score = questions.filter((q, i) => answers[i] === q.correctAnswer).length;
  const weakTopics = [...new Set(questions.filter((q, i) => answers[i] !== q.correctAnswer).map((q) => q.topic || topic))];
  return <div>
    <p style={{ color: theme.textMuted, fontSize: 13 }}>Answer every question and submit to get your score, explanations, and topics to review.</p>
    {questions.map((q, i) => <div key={i} style={{ padding: 15, border: "1px solid " + theme.border, borderRadius: 12, marginBottom: 12 }}>
      <p style={{ fontWeight: 600, lineHeight: 1.5 }}>{i + 1}. {q.question}</p>
      {q.options.map((o) => <label key={o.id} style={{ display: "flex", gap: 8, padding: 9, borderRadius: 8, background: submitted && o.id === q.correctAnswer ? acBg("green", isDark) : "transparent", cursor: submitted ? "default" : "pointer" }}>
        <input type="radio" name={"vant-quiz-" + i} disabled={submitted} checked={answers[i] === o.id} onChange={() => setAnswers({ ...answers, [i]: o.id })} />
        <span>{o.id}. {o.text}</span>
      </label>)}
      {submitted && <div style={{ marginTop: 8, fontSize: 13, color: theme.textMuted }}><strong style={{ color: answers[i] === q.correctAnswer ? ac("green", isDark) : ac("red", isDark) }}>{answers[i] === q.correctAnswer ? "Correct" : "Incorrect"} — answer: {q.correctAnswer}</strong><p>{q.explanation}</p>{q.topic && <p>Topic: {q.topic}</p>}</div>}
    </div>)}
    {!submitted ? <button type="button" disabled={Object.keys(answers).length !== questions.length} onClick={() => setSubmitted(true)} style={{ ...buttonStyle, background: ac(accent, isDark), opacity: Object.keys(answers).length !== questions.length ? 0.5 : 1 }}>Submit answers</button> : <div style={{ padding: 16, borderRadius: 12, background: acBg(accent, isDark) }}>
      <h3>Score: {score} / {questions.length} ({Math.round(score / questions.length * 100)}%)</h3>
      <strong>Topics to review</strong>
      {weakTopics.length ? weakTopics.map((t) => <p key={t} style={{ margin: "6px 0" }}>• {t}</p>) : <p>Excellent work — no missed topics.</p>}
      <button type="button" onClick={() => { setAnswers({}); setSubmitted(false); }} style={buttonStyle}>Try again</button>
    </div>}
  </div>;
}


