import { useEffect, useMemo, useState } from "react";
import {
  Activity, Check, ChevronDown, CircleAlert, ClipboardCheck, Clock3,
  Cpu, FileText, History, LoaderCircle, MessageSquareText, Plus,
  Save, ShieldCheck, Sparkles, Trash2, Users, X, Zap
} from "lucide-react";
import { supabase } from "./supabase";

const BUILTIN_AGENTS = [
  {
    role_key: "planner", name: "Planner", icon: "◈",
    description: "Breaks the goal into clear, dependency-aware tasks.",
    defaultProfile: { personality: "professional", approach: "systematic", communication: "balanced", challenge: 45, creativity: 25, detail: "detailed", temperature: 0.2 },
    instruction: "Create 3–5 clear, actionable subtasks with completion criteria. Do not claim to execute them. Keep task names short."
  },
  {
    role_key: "data_analyst", name: "Data Analyst", icon: "▥",
    description: "Examines supplied operational data and flags discrepancies.",
    defaultProfile: { personality: "professional", approach: "analytical", communication: "balanced", challenge: 55, creativity: 15, detail: "evidence", temperature: 0.1 },
    instruction: "Analyze the provided report and context. Check totals, percentages, dates, units, missing fields, inconsistent claims, and plausible anomalies. Show calculations where the source data supports them. Clearly distinguish observed facts from hypotheses. Never invent figures."
  },
  {
    role_key: "challenger", name: "Challenger", icon: "△",
    description: "Independently tests assumptions, conclusions, and alternative explanations.",
    defaultProfile: { personality: "direct", approach: "critical", communication: "balanced", challenge: 90, creativity: 35, detail: "evidence", temperature: 0.3 },
    instruction: "Independently challenge assumptions and conclusions using the original supplied material. Identify counter-evidence, missing context, alternative explanations, and claims that cannot be verified. Be constructively skeptical, not contrarian for its own sake."
  },
  {
    role_key: "researcher", name: "Researcher", icon: "⌕",
    description: "Organizes evidence and identifies what needs further verification.",
    defaultProfile: { personality: "curious", approach: "analytical", communication: "balanced", challenge: 55, creativity: 45, detail: "evidence", temperature: 0.4 },
    instruction: "Build an evidence-led review using only the supplied material. Cite specific quoted values, labels, dates, or excerpts where possible. List missing sources or claims that require external verification. Do not claim to have searched the web or external systems."
  },
  {
    role_key: "connector", name: "Connector", icon: "⌁",
    description: "Maps the information and system connections needed to continue work.",
    defaultProfile: { personality: "professional", approach: "systematic", communication: "concise", challenge: 35, creativity: 25, detail: "detailed", temperature: 0.3 },
    instruction: "Identify relevant data sources, fields, owners, and handoffs based only on the supplied context. No external integrations or connected tools are available in this prototype. Do not claim to access or modify an external system."
  },
  {
    role_key: "integrator", name: "Integrator", icon: "⊞",
    description: "Reconciles specialist findings into one coherent deliverable.",
    defaultProfile: { personality: "professional", approach: "analytical", communication: "balanced", challenge: 50, creativity: 20, detail: "detailed", temperature: 0.2 },
    instruction: "Synthesize the provided agent findings without erasing disagreement. Separate verified observations, interpretations, recommendations, limitations, and unresolved questions. Do not invent consensus."
  },
  {
    role_key: "mote", name: "Mote.EXE", icon: "●",
    description: "Coordinates the room, tracks handoffs, and prepares the final review.",
    defaultProfile: { personality: "professional", approach: "adaptive", communication: "balanced", challenge: 60, creativity: 25, detail: "detailed", temperature: 0.2 },
    instruction: "Act as VANT's careful CoWork coordinator. Reconcile specialist findings, call out material conflicts, identify missing evidence, and prepare a concise decision-ready report with recommended next steps. Do not claim to have executed actions. Never treat agent agreement as proof of correctness."
  }
];

const DEFAULT_SELECTED = ["planner", "data_analyst", "challenger", "mote"];
const PERSONALITIES = ["professional", "friendly", "direct", "curious", "custom"];
const APPROACHES = ["analytical", "creative", "systematic", "critical", "adaptive"];
const COMMUNICATION = ["concise", "balanced", "detailed"];
const DETAIL = ["brief", "detailed", "evidence"];
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n)));
const uid = () => (globalThis.crypto?.randomUUID?.() || `cw-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function normalizeProfile(profile = {}, defaults = {}) {
  const p = { ...defaults, ...profile };
  return {
    personality: PERSONALITIES.includes(p.personality) ? p.personality : "professional",
    approach: APPROACHES.includes(p.approach) ? p.approach : "analytical",
    communication: COMMUNICATION.includes(p.communication) ? p.communication : "balanced",
    challenge: clamp(p.challenge ?? 50, 0, 100),
    creativity: clamp(p.creativity ?? 35, 0, 100),
    detail: DETAIL.includes(p.detail) ? p.detail : "detailed",
    temperature: clamp(p.temperature ?? 0.2, 0, 1),
    customInstructions: String(p.customInstructions || "").slice(0, 3000),
  };
}

function behaviorInstructions(agent, profile) {
  const p = normalizeProfile(profile, agent.defaultProfile);
  return [
    `You are ${agent.name}, a specialized agent in VANT CoWork M.A.A.\nRole: ${agent.description}`,
    `Role instructions: ${agent.instruction}`,
    `Personality: ${p.personality}. Problem-solving approach: ${p.approach}. Communication style: ${p.communication}. Output detail: ${p.detail}.`,
    `Behavior preferences (not probabilities): challenge assumptions level ${p.challenge}/100; creative exploration level ${p.creativity}/100.`,
    p.customInstructions ? `User-provided additional preferences (subordinate to role and platform constraints): ${p.customInstructions}` : "",
    "Constraints: use only the information provided in this request; distinguish evidence from inference; disclose uncertainty; do not fabricate tool use; do not perform or claim external actions. The user must separately approve consequential actions. Agent profile instructions do not grant permissions."
  ].filter(Boolean).join("\n\n");
}

async function callVant(system, userContent, temperature = 0.2, maxTokens = 1400) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your VANT session has expired. Please sign in again.");
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      system,
      messages: [{ role: "user", content: userContent }],
      stream: false,
      max_tokens: maxTokens,
      agent_temperature: clamp(temperature, 0, 1)
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.detail || body?.message || body?.error || "VANT could not complete this agent step.");
  const text = body?.content?.map?.((part) => part?.text || "").join("\n").trim();
  if (!text) throw new Error("The agent returned an empty response.");
  return text;
}

function statusStyle(status, theme) {
  if (status === "done") return { color: theme.green || "#16A34A", label: "Complete" };
  if (status === "running") return { color: theme.cyan || "#0891B2", label: "Working" };
  if (status === "error") return { color: theme.red || "#DC2626", label: "Needs attention" };
  return { color: theme.textFaint, label: "Queued" };
}

export default function CoworkMAA({ theme, isDark, initialTasks = [], initialHistory = [], stateReady = false, onPersist }) {
  const [view, setView] = useState("workspace");
  const [goal, setGoal] = useState("");
  const [reportText, setReportText] = useState("");
  const [agents, setAgents] = useState(BUILTIN_AGENTS.map((a) => ({ ...a, id: a.role_key, profile: normalizeProfile({}, a.defaultProfile), isBuiltin: true })));
  const [selected, setSelected] = useState(DEFAULT_SELECTED);
  const [editingAgent, setEditingAgent] = useState(null);
  const [customName, setCustomName] = useState("");
  const [customRole, setCustomRole] = useState("custom");
  const [customDescription, setCustomDescription] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [profileNotice, setProfileNotice] = useState("");
  const [persistenceAvailable, setPersistenceAvailable] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [tasks, setTasks] = useState(initialTasks);
  const [history, setHistory] = useState(initialHistory);
  const [currentRun, setCurrentRun] = useState(null);

  useEffect(() => {
    if (!stateReady) return;
    setTasks(Array.isArray(initialTasks) ? initialTasks : []);
    setHistory(Array.isArray(initialHistory) ? initialHistory : []);
  }, [stateReady, initialTasks, initialHistory]);

  useEffect(() => {
    if (!stateReady) return;
    let active = true;
    (async () => {
      setLoadingProfiles(true);
      try {
        const { data: userResult } = await supabase.auth.getUser();
        const user = userResult?.user;
        if (!user || user.is_anonymous) {
          if (active) {
            setPersistenceAvailable(false);
            setProfileNotice("Sign in to save custom agent profiles. Built-in agents are available for this session.");
          }
          return;
        }
        const { data, error } = await supabase
          .from("cowork_agent_profiles")
          .select("id,user_id,name,description,role_key,profile,updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        if (!active) return;
        setPersistenceAvailable(true);
        const saved = Array.isArray(data) ? data : [];
        setAgents((current) => {
          const next = current.map((agent) => {
            const row = saved.find((item) => item.role_key === agent.role_key);
            return row ? { ...agent, id: row.id, profileId: row.id, name: agent.isBuiltin ? agent.name : row.name, description: row.description || agent.description, profile: normalizeProfile(row.profile, agent.defaultProfile) } : agent;
          });
          saved.filter((row) => row.role_key === "custom").forEach((row) => {
            next.push({
              id: row.id, profileId: row.id, role_key: "custom", name: row.name,
              description: row.description || "User-created CoWork agent.",
              icon: "✦", instruction: String(row.profile?.roleInstructions || "Analyze the task within your declared specialty and disclose uncertainty."),
              defaultProfile: normalizeProfile({}, {}), profile: normalizeProfile(row.profile, {}),
              isBuiltin: false
            });
          });
          return next;
        });
        if (active) setProfileNotice("");
      } catch (error) {
        if (active) {
          setPersistenceAvailable(false);
          setProfileNotice("Agent profile storage is not available yet. Apply the CoWork agent-profile Supabase migration to enable cross-session saving.");
          console.warn("VANT CoWork: profile load failed", error);
        }
      } finally {
        if (active) setLoadingProfiles(false);
      }
    })();
    return () => { active = false; };
  }, [stateReady]);

  useEffect(() => {
    if (!stateReady) return;
    onPersist?.({ cowork_tasks: tasks });
  }, [tasks, stateReady]);

  useEffect(() => {
    if (!stateReady) return;
    onPersist?.({ cowork_history: history });
  }, [history, stateReady]);

  const selectedAgents = useMemo(() => agents.filter((agent) => selected.includes(agent.id)), [agents, selected]);
  const activeAgent = agents.find((agent) => agent.id === editingAgent) || null;
  const completedCount = currentRun?.steps?.filter((step) => step.status === "done").length || 0;

  function toggleAgent(agentId) {
    setSelected((current) => {
      if (current.includes(agentId)) return current.filter((id) => id !== agentId);
      if (current.length >= 5) {
        setRunError("Choose up to five agents per run for predictable latency and cost.");
        return current;
      }
      setRunError("");
      return [...current, agentId];
    });
  }

  async function saveProfile(agent, updates = {}) {
    const merged = { ...agent, ...updates, profile: normalizeProfile({ ...agent.profile, ...(updates.profile || {}) }, agent.defaultProfile) };
    setAgents((current) => current.map((item) => item.id === agent.id ? merged : item));
    setEditingAgent(null);
    if (!persistenceAvailable) {
      setProfileNotice("This profile is active for this session, but cannot be saved until the profile migration is available and you are signed in.");
      return;
    }
    try {
      const { data: userResult } = await supabase.auth.getUser();
      const userId = userResult?.user?.id;
      if (!userId || userResult.user.is_anonymous) throw new Error("Sign in to save agent profiles.");
      const payload = {
        user_id: userId,
        name: merged.name,
        description: merged.description || "",
        role_key: merged.role_key,
        profile: { ...merged.profile, roleInstructions: merged.isBuiltin ? undefined : merged.instruction }
      };
      let query;
      if (merged.profileId) {
        query = supabase.from("cowork_agent_profiles").update(payload).eq("id", merged.profileId).eq("user_id", userId);
      } else if (merged.isBuiltin) {
        const { data: existing, error: lookupError } = await supabase.from("cowork_agent_profiles").select("id").eq("user_id", userId).eq("role_key", merged.role_key).limit(1).maybeSingle();
        if (lookupError) throw lookupError;
        query = existing?.id
          ? supabase.from("cowork_agent_profiles").update(payload).eq("id", existing.id).eq("user_id", userId)
          : supabase.from("cowork_agent_profiles").insert(payload);
      } else {
        query = supabase.from("cowork_agent_profiles").insert(payload);
      }
      const { data, error } = await query.select("id").single();
      if (error) throw error;
      setAgents((current) => current.map((item) => item.id === agent.id ? { ...merged, id: data.id, profileId: data.id } : item));
      setProfileNotice("Agent profile saved.");
    } catch (error) {
      setProfileNotice(error.message || "Could not save this agent profile.");
      setPersistenceAvailable(false);
    }
  }

  async function createAgent(event) {
    event.preventDefault();
    const name = customName.trim();
    const description = customDescription.trim();
    if (!name) return;
    const newAgent = {
      id: uid(), role_key: "custom", name, description: description || "Custom VANT CoWork agent.",
      icon: "✦", instruction: "Analyze the task within your declared specialty. Be explicit about evidence, assumptions, and uncertainty.",
      defaultProfile: normalizeProfile({}, {}), profile: normalizeProfile({}, {}),
      isBuiltin: false
    };
    setAgents((current) => [...current, newAgent]);
    setSelected((current) => current.length < 5 ? [...current, newAgent.id] : current);
    setCustomName("");
    setCustomDescription("");
    setShowCreate(false);
    await saveProfile(newAgent);
  }

  async function deleteAgent(agent) {
    if (agent.isBuiltin) return;
    setAgents((current) => current.filter((item) => item.id !== agent.id));
    setSelected((current) => current.filter((id) => id !== agent.id));
    if (agent.profileId && persistenceAvailable) {
      const { data: userResult } = await supabase.auth.getUser();
      const userId = userResult?.user?.id;
      if (userId) {
        const { error } = await supabase.from("cowork_agent_profiles").delete().eq("id", agent.profileId).eq("user_id", userId);
        if (error) setProfileNotice("Agent removed from this session, but could not be deleted from saved profiles.");
      }
    }
  }

  async function runWorkspace(event) {
    event.preventDefault();
    const objective = goal.trim();
    const source = reportText.trim();
    if (!objective || running) return;
    if (!selectedAgents.length) {
      setRunError("Select at least one agent before starting a CoWork run.");
      return;
    }
    setRunning(true);
    setRunError("");
    const runId = uid();
    const startedAt = new Date().toISOString();
    const steps = [];
    const setStep = (id, patch) => setCurrentRun((current) => current?.id !== runId ? current : {
      ...current,
      steps: current.steps.map((step) => step.id === id ? { ...step, ...patch } : step)
    });
    const appendStep = (step) => {
      steps.push(step);
      setCurrentRun({ id: runId, objective, startedAt, phase: "planning", steps: [...steps], findings: [], report: "" });
    };

    setCurrentRun({ id: runId, objective, startedAt, phase: "planning", steps: [], findings: [], report: "" });
    const input = `OBJECTIVE\n${objective}\n\nSOURCE REPORT / CONTEXT\n${source || "(No report pasted. Analyze the objective and identify what evidence would be needed; do not invent operational data.)"}`;
    try {
      const planner = selectedAgents.find((agent) => agent.role_key === "planner");
      let plan = ["Review the supplied objective and source context", "Identify findings, discrepancies, and uncertainties", "Prepare evidence-backed recommendations"];
      if (planner) {
        const step = { id: uid(), label: "Plan the work", agent: planner.name, status: "running", output: "" };
        appendStep(step);
        const result = await callVant(behaviorInstructions(planner, planner.profile), `Create a plan for this business-operations task. Return 3–5 short task lines, one per line, no Markdown table.\n\n${input}`, planner.profile.temperature, 1200);
        plan = result.split("\n").map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean).slice(0, 5);
        if (!plan.length) plan = ["Review the supplied objective and source context"];
        setStep(step.id, { status: "done", output: result });
      }

      const workingAgents = selectedAgents.filter((agent) => !["planner", "mote", "integrator"].includes(agent.role_key));
      const researchResults = [];
      setCurrentRun((current) => current?.id === runId ? { ...current, phase: "analysis", plan } : current);
      const agentJobs = workingAgents.map(async (agent) => {
        const step = { id: uid(), label: `Review: ${agent.name}`, agent: agent.name, status: "running", output: "" };
        appendStep(step);
        try {
          const result = await callVant(
            behaviorInstructions(agent, agent.profile),
            `${input}\n\nASSIGNED WORK\nReview the supplied material according to your specialist role.\n\nPROPOSED PLAN\n${plan.map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\nReturn concise findings with evidence, possible discrepancies, recommendations, and unresolved questions. Do not claim to execute actions.`,
            agent.profile.temperature,
            1800
          );
          researchResults.push({ agent: agent.name, role_key: agent.role_key, output: result, status: "done" });
          setStep(step.id, { status: "done", output: result });
        } catch (error) {
          researchResults.push({ agent: agent.name, role_key: agent.role_key, output: error.message, status: "error" });
          setStep(step.id, { status: "error", output: error.message });
        }
      });
      await Promise.all(agentJobs);

      if (!workingAgents.length && !planner) {
        researchResults.push({ agent: selectedAgents[0].name, role_key: selectedAgents[0].role_key, output: "No analysis specialist was selected. Add a Data Analyst, Challenger, or Researcher for richer findings.", status: "done" });
      }

      const coordinator = selectedAgents.find((agent) => agent.role_key === "mote") || selectedAgents.find((agent) => agent.role_key === "integrator");
      let report;
      if (coordinator && researchResults.length) {
        const step = { id: uid(), label: "Reconcile findings", agent: coordinator.name, status: "running", output: "" };
        appendStep(step);
        setCurrentRun((current) => current?.id === runId ? { ...current, phase: "review", findings: [...researchResults] } : current);
        try {
          report = await callVant(
            behaviorInstructions(coordinator, coordinator.profile),
            `Prepare the final VANT CoWork review for the user.\n\n${input}\n\nPLAN\n${plan.map((item, i) => `${i + 1}. ${item}`).join("\n")}\n\nSPECIALIST FINDINGS\n${researchResults.map((item) => `### ${item.agent} (${item.status})\n${item.output}`).join("\n\n")}\n\nStructure the result as: Executive summary; Verified observations; Discrepancies and risks; Recommended next steps; Unresolved questions. Distinguish facts from inferences. Clearly disclose failed agent steps. Finish with: "No external actions were executed; recommendations require human review."`,
            coordinator.profile.temperature,
            2400
          );
          setStep(step.id, { status: "done", output: report });
        } catch (error) {
          setStep(step.id, { status: "error", output: error.message });
          report = `## VANT CoWork findings\n\n${researchResults.map((item) => `### ${item.agent}\n${item.output}`).join("\n\n")}\n\nCoordinator synthesis failed: ${error.message}\n\nNo external actions were executed; recommendations require human review.`;
        }
      } else {
        report = `## VANT CoWork findings\n\n${researchResults.map((item) => `### ${item.agent}\n${item.output}`).join("\n\n")}\n\nNo external actions were executed; recommendations require human review.`;
      }

      const finishedAt = new Date().toISOString();
      const doneSteps = steps.map((step) => ({ ...step, status: step.status === "running" ? "error" : step.status }));
      const resultRecord = { id: runId, goal: objective, summary: report, plan, findings: researchResults, stepCount: doneSteps.length, steps: doneSteps, startedAt, completedAt: finishedAt, agentNames: selectedAgents.map((agent) => agent.name) };
      setCurrentRun({ id: runId, objective, startedAt, phase: "complete", steps: doneSteps, findings: researchResults, plan, report, finishedAt });
      setHistory((current) => [resultRecord, ...current].slice(0, 50));
      setTasks((current) => [
        ...current.filter((task) => task.runId !== runId),
        ...plan.map((name, index) => ({ id: `${runId}-${index}`, runId, goalId: runId, goalText: objective, name, status: "done", priority: "moderate", assignedAgents: selectedAgents.map((agent) => agent.name), createdAt: finishedAt }))
      ]);
      setView("workspace");
    } catch (error) {
      setRunError(error.message || "The CoWork run failed.");
      setCurrentRun((current) => current?.id === runId ? { ...current, phase: "error" } : current);
    } finally {
      setRunning(false);
    }
  }

  const panel = { background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16 };
  const field = { width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.inputBg || theme.surfaceCard || theme.surface, color: theme.text, outline: "none", fontSize: 13.5, boxSizing: "border-box" };
  const button = { border: `1px solid ${theme.border}`, background: theme.surfaceCard || theme.surface, color: theme.text, borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 7 };
  const accent = isDark ? "#D4AF55" : "#8A6B20";

  return (
    <div style={{ padding: 24, height: "100%", minHeight: 0, overflowY: "auto", color: theme.text, boxSizing: "border-box" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: isDark ? "#262116" : "#F5EEDB", display: "grid", placeItems: "center", color: accent }}><Users size={21} /></div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: "0 0 3px", fontSize: 11, letterSpacing: 1.6, color: theme.textFaint, fontFamily: "monospace" }}>VANT COWORK · M.A.A.</p>
          <h1 style={{ margin: 0, fontSize: 25, fontWeight: 600, letterSpacing: -0.5 }}>Multi-Agent Assistance</h1>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: theme.textMuted }}>Independent responsibilities. Shared intelligence. Coordinated execution.</p>
        </div>
      </div>

      {profileNotice && <div style={{ ...panel, display: "flex", gap: 8, alignItems: "flex-start", color: theme.textMuted, fontSize: 12.5, marginBottom: 12 }}><CircleAlert size={16} color={accent} style={{ flexShrink: 0 }} /><span>{profileNotice}</span></div>}
      {!persistenceAvailable && !loadingProfiles && <div style={{ ...panel, borderColor: isDark ? "#6B5526" : "#DDC88C", marginBottom: 14, fontSize: 12.5, color: theme.textMuted }}>Profile saving requires the migration at <code>supabase/migrations/20261028090000_cowork_agent_profiles.sql</code>. Existing CoWork task/history persistence remains separate.</div>}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <button style={{ ...button, background: view === "workspace" ? (theme.surfaceStrong || theme.surface) : "transparent" }} onClick={() => setView("workspace")}><Activity size={14} /> Workspace</button>
        <button style={{ ...button, background: view === "agents" ? (theme.surfaceStrong || theme.surface) : "transparent" }} onClick={() => setView("agents")}><Users size={14} /> Agent library ({agents.length})</button>
        <button style={{ ...button, background: view === "history" ? (theme.surfaceStrong || theme.surface) : "transparent" }} onClick={() => setView("history")}><History size={14} /> Run history ({history.length})</button>
      </div>

      {view === "agents" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))", gap: 12 }}>
          {agents.map((agent) => (
            <div key={agent.id} style={{ ...panel, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, display: "grid", placeItems: "center", background: isDark ? "#28251E" : "#F6F0DF", color: accent, fontSize: 20 }}>{agent.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: "block", fontSize: 14 }}>{agent.name}</strong>
                  <span style={{ color: theme.textFaint, fontSize: 11.5 }}>{agent.isBuiltin ? "Built-in specialist" : "Custom agent"}</span>
                </div>
                <button title="Customize behavior" onClick={() => setEditingAgent(agent.id)} style={{ ...button, padding: 7 }}><Cpu size={14} /></button>
              </div>
              <p style={{ color: theme.textMuted, fontSize: 12.5, lineHeight: 1.5, margin: 0, minHeight: 38 }}>{agent.description}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ color: theme.textFaint, fontSize: 11 }}>Temp {agent.profile.temperature.toFixed(2)} · {agent.profile.approach}</span>
                <button onClick={() => toggleAgent(agent.id)} style={{ ...button, borderColor: selected.includes(agent.id) ? accent : theme.border, color: selected.includes(agent.id) ? accent : theme.textMuted }}>{selected.includes(agent.id) ? <Check size={13} /> : <Plus size={13} />}{selected.includes(agent.id) ? "Selected" : "Add to team"}</button>
              </div>
              {!agent.isBuiltin && <button onClick={() => deleteAgent(agent)} style={{ ...button, alignSelf: "flex-start", color: theme.red || "#DC2626" }}><Trash2 size={13} /> Delete custom agent</button>}
            </div>
          ))}
          <button onClick={() => setShowCreate(true)} style={{ ...panel, minHeight: 160, borderStyle: "dashed", display: "grid", placeItems: "center", gap: 8, color: theme.textMuted, cursor: "pointer" }}><span style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: 10, background: isDark ? "#28251E" : "#F6F0DF", color: accent }}><Plus size={20} /></span><span style={{ fontWeight: 600, fontSize: 13 }}>Create a personalized agent</span><span style={{ fontSize: 11.5 }}>Define its role and working style</span></button>
        </div>
      )}

      {view === "workspace" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(270px, 0.8fr)", gap: 14, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <form onSubmit={runWorkspace} style={{ ...panel, display: "flex", flexDirection: "column", gap: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={16} color={accent} /><strong style={{ fontSize: 14 }}>Delegate a business task</strong></div>
              <input value={goal} onChange={(event) => setGoal(event.target.value)} disabled={running} placeholder="e.g. Analyze Week 43 handover performance and find discrepancies" style={field} maxLength={2000} required />
              <textarea value={reportText} onChange={(event) => setReportText(event.target.value)} disabled={running} placeholder="Paste the operational report, figures, or context here (optional, max 20,000 characters)…" style={{ ...field, minHeight: 130, resize: "vertical", lineHeight: 1.5 }} maxLength={20000} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ color: theme.textFaint, fontSize: 11.5 }}>{selectedAgents.length} agents selected · maximum 5 · no external tools enabled</span>
                <button type="submit" disabled={running || !goal.trim() || !selectedAgents.length} style={{ ...button, background: accent, color: isDark ? "#100F0C" : "#FFFFFF", borderColor: accent, opacity: running || !goal.trim() || !selectedAgents.length ? 0.55 : 1, fontWeight: 700 }}><Zap size={14} />{running ? "Coordinating…" : "Run CoWork"}</button>
              </div>
              {runError && <div style={{ color: theme.red || "#DC2626", fontSize: 12.5, display: "flex", gap: 7 }}><CircleAlert size={15} />{runError}</div>}
            </form>

            <div style={panel}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}><strong style={{ fontSize: 14 }}>Team for this run</strong><button onClick={() => setView("agents")} style={{ ...button, padding: "6px 9px" }}>Manage agents <ChevronDown size={13} /></button></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8 }}>
                {agents.map((agent) => {
                  const chosen = selected.includes(agent.id);
                  return <button key={agent.id} onClick={() => toggleAgent(agent.id)} disabled={running} style={{ padding: 11, textAlign: "left", borderRadius: 11, border: `1px solid ${chosen ? accent : theme.border}`, background: chosen ? (isDark ? "#252116" : "#FAF5E7") : "transparent", color: theme.text, cursor: running ? "not-allowed" : "pointer", opacity: running ? 0.7 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}><span style={{ color: accent }}>{agent.icon}</span><strong style={{ fontSize: 12.5 }}>{agent.name}</strong>{chosen && <Check size={12} color={accent} />}</div>
                    <span style={{ color: theme.textMuted, fontSize: 11.2, lineHeight: 1.4, display: "block" }}>{agent.description}</span>
                  </button>;
                })}
              </div>
            </div>

            {currentRun && <div style={panel}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Activity size={16} color={accent} /><strong style={{ fontSize: 14 }}>Run progress</strong><span style={{ marginLeft: "auto", fontSize: 11.5, color: theme.textFaint }}>{currentRun.phase}</span></div>
              {currentRun.plan?.length > 0 && <ol style={{ margin: "0 0 13px", paddingLeft: 22, color: theme.textMuted, fontSize: 12.5 }}>{currentRun.plan.map((step, i) => <li key={i} style={{ marginBottom: 4 }}>{step}</li>)}</ol>}
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {currentRun.steps.map((step) => {
                  const status = statusStyle(step.status, theme);
                  return <div key={step.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: 10, borderRadius: 9, background: theme.surfaceCard || theme.surface }}>
                    {step.status === "running" ? <LoaderCircle size={15} color={status.color} className="v-pulse" /> : step.status === "done" ? <Check size={15} color={status.color} /> : <CircleAlert size={15} color={status.color} />}
                    <div style={{ flex: 1 }}><strong style={{ display: "block", fontSize: 12.5 }}>{step.label}</strong><span style={{ color: theme.textFaint, fontSize: 11 }}>{step.agent} · {status.label}</span>{step.output && <details style={{ marginTop: 6 }}><summary style={{ cursor: "pointer", color: theme.textMuted, fontSize: 11.5 }}>View output</summary><pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 11.5, lineHeight: 1.5, color: theme.textMuted }}>{step.output}</pre></details>}</div>
                  </div>;
                })}
              </div>
              {running && <div style={{ color: theme.textFaint, fontSize: 11.5, marginTop: 10 }}>{completedCount} steps complete. Specialist agents are analyzing independently; external actions are disabled.</div>}
            </div>}
          </div>

          <div style={{ ...panel, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><ClipboardCheck size={17} color={accent} /><strong style={{ fontSize: 14 }}>Decision-ready report</strong></div>
            {currentRun?.report ? <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 12.5, color: theme.textMuted }}>{currentRun.report}</div> : <div style={{ textAlign: "center", padding: "34px 10px", color: theme.textFaint }}><FileText size={25} style={{ marginBottom: 10, opacity: 0.65 }} /><p style={{ fontSize: 12.5, lineHeight: 1.55 }}>Your final report will appear here after the selected agents have reviewed the task.</p><p style={{ fontSize: 11.5 }}>Recommendations only. No external actions are executed.</p></div>}
            {currentRun?.report && <div style={{ display: "flex", alignItems: "flex-start", gap: 7, marginTop: 14, padding: 10, borderRadius: 9, background: isDark ? "#252116" : "#FAF5E7", color: theme.textMuted, fontSize: 11.5 }}><ShieldCheck size={15} color={accent} /><span>Human review required before acting on recommendations. This prototype has no external execution tools.</span></div>}
          </div>
        </div>
      )}

      {view === "history" && <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {history.length === 0 && <div style={{ ...panel, color: theme.textFaint, fontSize: 13 }}>No runs yet. Submit a business task to start your first M.A.A. workflow.</div>}
        {history.map((item) => <div key={item.id} style={panel}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}><div style={{ flex: 1 }}><strong style={{ fontSize: 13.5 }}>{item.goal || item.objective}</strong><p style={{ color: theme.textFaint, fontSize: 11, margin: "5px 0 10px" }}>{new Date(item.completedAt || item.startedAt || Date.now()).toLocaleString()} · {item.agentNames?.join(", ") || "CoWork"}</p></div><button style={button} onClick={() => { setCurrentRun({ id: item.id, objective: item.goal, startedAt: item.startedAt, phase: "complete", steps: item.steps || [], findings: item.findings || [], plan: item.plan || [], report: item.summary || "" }); setView("workspace"); }}><FileText size={13} /> Open report</button></div>
          <p style={{ color: theme.textMuted, whiteSpace: "pre-wrap", lineHeight: 1.55, fontSize: 12.5, margin: 0 }}>{item.summary}</p>
        </div>)}
      </div>}

      {activeAgent && <div onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingAgent(null); }} style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.62)", display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}>
        <div style={{ width: "min(620px, 100%)", maxHeight: "90vh", overflowY: "auto", background: theme.surfaceCard || theme.surface, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 22, color: theme.text }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}><Cpu size={19} color={accent} /><div style={{ flex: 1 }}><h2 style={{ margin: 0, fontSize: 18 }}>Customize {activeAgent.name}</h2><p style={{ color: theme.textFaint, fontSize: 12, margin: "4px 0 0" }}>Behavior preferences apply to this agent, not its permissions.</p></div><button onClick={() => setEditingAgent(null)} style={button}><X size={15} /></button></div>
          <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const profile = { personality: form.get("personality"), approach: form.get("approach"), communication: form.get("communication"), challenge: Number(form.get("challenge")), creativity: Number(form.get("creativity")), detail: form.get("detail"), temperature: Number(form.get("temperature")), customInstructions: String(form.get("customInstructions") || "").slice(0, 3000) }; saveProfile(activeAgent, { profile, instruction: activeAgent.isBuiltin ? activeAgent.instruction : String(form.get("roleInstructions") || activeAgent.instruction).slice(0, 3000) }); }} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 13 }}>
            <label style={{ display: "grid", gap: 5, fontSize: 12, color: theme.textMuted }}>Personality<select name="personality" defaultValue={activeAgent.profile.personality} style={field}>{PERSONALITIES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label style={{ display: "grid", gap: 5, fontSize: 12, color: theme.textMuted }}>Problem-solving approach<select name="approach" defaultValue={activeAgent.profile.approach} style={field}>{APPROACHES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label style={{ display: "grid", gap: 5, fontSize: 12, color: theme.textMuted }}>Communication<select name="communication" defaultValue={activeAgent.profile.communication} style={field}>{COMMUNICATION.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label style={{ display: "grid", gap: 5, fontSize: 12, color: theme.textMuted }}>Output detail<select name="detail" defaultValue={activeAgent.profile.detail} style={field}>{DETAIL.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label style={{ display: "grid", gap: 5, fontSize: 12, color: theme.textMuted }}>Challenge assumptions: {activeAgent.profile.challenge}%<input name="challenge" type="range" min="0" max="100" step="5" defaultValue={activeAgent.profile.challenge} /></label>
            <label style={{ display: "grid", gap: 5, fontSize: 12, color: theme.textMuted }}>Creative exploration: {activeAgent.profile.creativity}%<input name="creativity" type="range" min="0" max="100" step="5" defaultValue={activeAgent.profile.creativity} /></label>
            <label style={{ display: "grid", gap: 5, fontSize: 12, color: theme.textMuted }}>Temperature: {activeAgent.profile.temperature.toFixed(2)}<input name="temperature" type="range" min="0" max="1" step="0.05" defaultValue={activeAgent.profile.temperature} /></label>
            {!activeAgent.isBuiltin && <label style={{ display: "grid", gap: 5, fontSize: 12, color: theme.textMuted, gridColumn: "1 / -1" }}>Role instructions<textarea name="roleInstructions" defaultValue={activeAgent.instruction} maxLength={3000} style={{ ...field, minHeight: 80 }} /></label>}
            <label style={{ display: "grid", gap: 5, fontSize: 12, color: theme.textMuted, gridColumn: "1 / -1" }}>Additional behavior instructions<textarea name="customInstructions" defaultValue={activeAgent.profile.customInstructions} maxLength={3000} placeholder="Describe how this agent should approach work…" style={{ ...field, minHeight: 80 }} /></label>
            <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", gap: 10 }}><span style={{ color: theme.textFaint, fontSize: 11.5, alignSelf: "center" }}>Temperature is used only when supported by the current model API.</span><button type="submit" style={{ ...button, background: accent, borderColor: accent, color: isDark ? "#11100D" : "#FFFFFF" }}><Save size={14} /> Save behavior</button></div>
          </form>
        </div>
      </div>}

      {showCreate && <div onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }} style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.62)", display: "flex", justifyContent: "center", alignItems: "center", padding: 16 }}>
        <form onSubmit={createAgent} style={{ width: "min(520px, 100%)", background: theme.surfaceCard || theme.surface, border: `1px solid ${theme.border}`, borderRadius: 18, padding: 22, color: theme.text, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Plus size={18} color={accent} /><h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>Create a personalized agent</h2><button type="button" onClick={() => setShowCreate(false)} style={button}><X size={14} /></button></div>
          <label style={{ display: "grid", gap: 5, fontSize: 12, color: theme.textMuted }}>Agent name<input value={customName} onChange={(event) => setCustomName(event.target.value)} required maxLength={80} style={field} placeholder="e.g. Shipment Auditor" /></label>
          <label style={{ display: "grid", gap: 5, fontSize: 12, color: theme.textMuted }}>Specialty / description<input value={customDescription} onChange={(event) => setCustomDescription(event.target.value)} maxLength={500} style={field} placeholder="e.g. Reviews handover logs and SLA exceptions" /></label>
          <p style={{ color: theme.textFaint, fontSize: 11.5, margin: 0 }}>After creation, customize personality, approach, communication, challenge level, creativity, output detail, temperature, and role instructions.</p>
          <button type="submit" style={{ ...button, background: accent, color: isDark ? "#11100D" : "#FFFFFF", borderColor: accent, justifyContent: "center" }}><Plus size={14} /> Create agent</button>
        </form>
      </div>}
    </div>
  );
}
