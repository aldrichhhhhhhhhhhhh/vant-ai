import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, BookOpen, FolderOpen, Plus, X, Minus, Grip, ArrowRight, RefreshCw, FileText, PencilLine, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "./supabase";

const panelBase = { width: 292, borderRadius: 16, overflow: "hidden", boxShadow: "0 18px 55px rgba(0,0,0,.22)", backdropFilter: "blur(16px)" };
const isoDate = (date) => { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const prettyDate = (value) => value ? new Date(value + "T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "No due date";

export default function VantEducationWidgets({ theme, isDark, user, onGoToEducation, onGoToTools, embedded = false }) {
  const [tasks, setTasks] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState({ calendar: true, tracker: false, docs: false });
  const [minimized, setMinimized] = useState({});
  const [positions, setPositions] = useState({ calendar: { x: 0, y: 0 }, tracker: { x: 0, y: 0 }, docs: { x: 0, y: 0 } });
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [showAdd, setShowAdd] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [draft, setDraft] = useState({ title: "", due_date: isoDate(new Date()), task_type: "assignment", priority: "normal" });
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(null);

  const load = useCallback(async () => {
    if (!user?.id || user.isGuest) { setTasks([]); setMaterials([]); return; }
    setLoading(true);
    const [taskResult, materialResult] = await Promise.all([
      supabase.from("education_tasks").select("id,user_id,title,description,task_type,due_date,status,priority,created_at,updated_at").eq("user_id",user.id).order("due_date",{ascending:true}),
      supabase.from("study_materials").select("id,title,material_type,topic,folder,updated_at,created_at").eq("user_id",user.id).order("updated_at",{ascending:false}).limit(100)
    ]);
    if (taskResult.error) { console.error("VANT Education widgets: task load failed",taskResult.error); setNotice("Tasks could not load. Refresh to try again."); }
    else setTasks(taskResult.data || []);
    if (materialResult.error) console.error("VANT Education widgets: materials load failed",materialResult.error);
    else setMaterials(materialResult.data || []);
    setLoading(false);
  }, [user?.id,user?.isGuest]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (embedded) setOpen({ calendar: true, tracker: true, docs: true }); }, [embedded]);
  useEffect(() => {
    if (!dragging) return;
    const move = (event) => setPositions((current) => ({ ...current, [dragging.id]: { x: Math.max(-window.innerWidth + 320, Math.min(0, dragging.startX + event.clientX - dragging.clientX)), y: Math.max(-window.innerHeight + 180, Math.min(0, dragging.startY + event.clientY - dragging.clientY)) } }));
    const up = () => setDragging(null);
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [dragging]);

  const today = isoDate(new Date());
  const completed = tasks.filter((task) => task.status === "completed").length;
  const pending = tasks.filter((task) => task.status !== "completed").length;
  const overdue = tasks.filter((task) => task.status !== "completed" && task.due_date && task.due_date < today).length;
  const weekStart = new Date(); weekStart.setHours(0,0,0,0); weekStart.setDate(weekStart.getDate()-((weekStart.getDay()+6)%7));
  const weekTasks = tasks.filter((task) => task.status === "completed" && task.updated_at && new Date(task.updated_at) >= weekStart).length;
  const writingMaterials = useMemo(() => materials.filter((item) => ["essay","writing","outline","draft","citation"].some((key) => String(item.material_type || "").toLowerCase().includes(key)) || ["writing","essays","drafts","outlines","citations"].includes(String(item.folder || "").toLowerCase())), [materials]);
  const monthCells = useMemo(() => {
    const first = new Date(month.getFullYear(),month.getMonth(),1);
    const start = new Date(first); start.setDate(first.getDate()-((first.getDay()+6)%7));
    return Array.from({length:35},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; });
  }, [month]);
  const colors = { border: theme.border, card: theme.surfaceCard || theme.surface, soft: theme.surface, text: theme.text, muted: theme.textMuted, faint: theme.textFaint, accent: isDark ? "#C4B5FD" : "#6D28D9", green: isDark ? "#6EE7B7" : "#047857", red: isDark ? "#FCA5A5" : "#B91C1C", high: isDark ? "#F87171" : "#DC2626", moderate: isDark ? "#FBBF24" : "#D97706", low: isDark ? "#60A5FA" : "#2563EB" };
  const priorityStyle = (task) => task.status === "completed"
    ? { label: "DONE", color: colors.green, background: isDark ? "rgba(52,211,153,.14)" : "rgba(16,185,129,.12)" }
    : task.priority === "high"
      ? { label: "HIGH", color: colors.high, background: isDark ? "rgba(248,113,113,.14)" : "rgba(220,38,38,.10)" }
      : task.priority === "low"
        ? { label: "LOW", color: colors.low, background: isDark ? "rgba(96,165,250,.14)" : "rgba(37,99,235,.10)" }
        : { label: "MODERATE", color: colors.moderate, background: isDark ? "rgba(251,191,36,.14)" : "rgba(217,119,6,.10)" };

  async function addTask(event) {
    event.preventDefault();
    if (!draft.title.trim() || !user?.id || user.isGuest) return;
    const { data, error } = await supabase.from("education_tasks").insert({ user_id:user.id, title:draft.title.trim(), due_date:draft.due_date || null, task_type:draft.task_type, priority:draft.priority || "normal" }).select().single();
    if (error) { console.error("VANT Education widgets: task save failed",error); setNotice("Task wasn't saved. Please try again."); return; }
    setTasks((current)=>[...current,data].sort((a,b)=>(a.due_date||"9999").localeCompare(b.due_date||"9999")));
    setDraft({title:"",due_date:selectedDate||today,task_type:"assignment",priority:"normal"}); setShowAdd(false); setNotice("Added to your student task tracker.");
  }
  async function toggleTask(task) {
    const status = task.status === "completed" ? "pending" : "completed";
    const { data,error } = await supabase.from("education_tasks").update({status,updated_at:new Date().toISOString()}).eq("id",task.id).eq("user_id",user.id).select().single();
    if(error){setNotice("Couldn't update that task.");return;}
    setTasks((current)=>current.map((item)=>item.id===task.id?data:item));
  }
  async function deleteTask(task) {
    const {error}=await supabase.from("education_tasks").delete().eq("id",task.id).eq("user_id",user.id);
    if(error){setNotice("Couldn't delete that task.");return;}
    setTasks((current)=>current.filter((item)=>item.id!==task.id));
  }

  function openWidget(id) { setOpen((current)=>({...current,[id]:true})); setMinimized((current)=>({...current,[id]:false})); }
  function widget(id,title,Icon,content) {
    if (!open[id]) return null;
    const pos = positions[id] || {x:0,y:0};
    return <section key={id} style={{...panelBase, width: embedded ? "100%" : panelBase.width, position: embedded ? "relative" : "fixed", right: embedded ? "auto" : 18, bottom: embedded ? "auto" : 18 + (id==="calendar"?0:id==="tracker"?70:140), transform: embedded ? "none" : `translate(${pos.x}px,${pos.y}px)`, zIndex: embedded ? 1 : 80, border:"1px solid "+colors.border, background: isDark?"rgba(25,22,38,.97)":"rgba(255,255,255,.97)", color:colors.text}}>
      <header onMouseDown={(event)=>{ if(event.target.closest("button")) return; setDragging({id,clientX:event.clientX,clientY:event.clientY,startX:pos.x,startY:pos.y}); }} style={{display:"flex",alignItems:"center",gap:8,padding:"11px 12px",borderBottom:"1px solid "+colors.border,cursor:"grab",userSelect:"none",background:colors.soft}}>
        <Grip size={14} color={colors.faint}/><Icon size={16} color={colors.accent}/><strong style={{fontSize:12.5,flex:1}}>{title}</strong>
        <button title={minimized[id]?"Expand":"Minimize"} onClick={()=>setMinimized((current)=>({...current,[id]:!current[id]}))} style={iconButton}><Minus size={14}/></button>
        <button title="Close widget" onClick={()=>setOpen((current)=>({...current,[id]:false}))} style={iconButton}><X size={14}/></button>
      </header>
      {!minimized[id] && <div style={{padding:12}}>{content}</div>}
    </section>;
  }
  const iconButton={display:"grid",placeItems:"center",width:25,height:25,borderRadius:7,border:"1px solid "+colors.border,background:"transparent",color:colors.muted,cursor:"pointer"};

  const field={width:"100%",padding:"8px 9px",borderRadius:8,border:"1px solid "+colors.border,background:colors.card,color:colors.text,fontSize:11.5};
  const smallButton={display:"inline-flex",alignItems:"center",gap:4,border:"1px solid "+colors.border,borderRadius:8,padding:"5px 8px",background:colors.soft,color:colors.text,fontSize:10.5,cursor:"pointer"};
  const primaryButton={border:0,borderRadius:8,padding:"8px 10px",background:colors.accent,color:isDark?"#171321":"#FFFFFF",fontSize:11.5,fontWeight:700,cursor:"pointer"};
  const linkButton={display:"flex",alignItems:"center",justifyContent:"center",gap:6,width:"100%",border:"1px solid "+colors.border,borderRadius:9,padding:"8px 9px",background:colors.soft,color:colors.text,fontSize:10.5,cursor:"pointer"};

  if (!user?.id || user.isGuest) return null;
  return <>
    <div style={embedded ? {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",alignItems:"start",gap:14,width:"100%"} : {display:"contents"}}>
    {widget("calendar","Student Calendar",CalendarDays,<>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <button style={iconButton} onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={14}/></button>
        <strong style={{fontSize:12.5}}>{month.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</strong>
        <button style={iconButton} onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={14}/></button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,textAlign:"center",fontSize:10,color:colors.faint,marginBottom:5}}>{["M","T","W","T","F","S","S"].map((d,i)=><span key={i}>{d}</span>)}</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>{monthCells.map((day,i)=>{const date=isoDate(day);const dayTasks=tasks.filter((task)=>task.due_date===date);const has=dayTasks.some((task)=>task.status!=="completed");const selected=date===selectedDate;return <button key={i} title={dayTasks.map(t=>t.title).join(", ")} onClick={()=>{setSelectedDate(date);setDraft((d)=>({...d,due_date:date}));setShowAdd(false);}} style={{height:29,borderRadius:8,border:selected?"1px solid "+colors.accent:date===today?"1px solid "+colors.border:"1px solid transparent",background:has?(isDark?"#7C3AED35":"#EDE9FE"):selected?colors.soft:"transparent",color:day.getMonth()===month.getMonth()?colors.text:colors.faint,fontSize:10.5,position:"relative",cursor:"pointer"}}>{day.getDate()}{has&&<span style={{position:"absolute",bottom:2,left:"calc(50% - 2px)",width:4,height:4,borderRadius:4,background:colors.accent}}/>}</button>})}</div>
      {selectedDate&&<div role="dialog" aria-label={"Tasks for "+prettyDate(selectedDate)} style={{marginTop:10,padding:11,borderRadius:12,border:"1px solid "+colors.border,background:colors.card,boxShadow:"0 8px 24px rgba(0,0,0,.12)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:9}}><div><strong style={{fontSize:12.5}}>{new Date(selectedDate+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})}</strong><div style={{fontSize:10,color:colors.muted,marginTop:2}}>Tasks scheduled for this date</div></div><button onClick={()=>setSelectedDate(null)} title="Close date card" style={iconButton}><X size={13}/></button></div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:9}}>{[[colors.high,"High"],[colors.moderate,"Moderate"],[colors.low,"Low"],[colors.green,"Done"]].map(([color,label])=><span key={label} style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:9.5,color:colors.muted}}><span style={{width:7,height:7,borderRadius:8,background:color}}/>{label}</span>)}</div>
        <div style={{display:"grid",gap:7,maxHeight:180,overflowY:"auto"}}>{tasks.filter(task=>task.due_date===selectedDate).sort((a,b)=>{const rank={high:0,normal:1,low:2};if(a.status==="completed")return 1;if(b.status==="completed")return -1;return (rank[a.priority]??1)-(rank[b.priority]??1);}).map(task=>{const priority=priorityStyle(task);return <div key={task.id} style={{display:"flex",alignItems:"center",gap:7,padding:"8px",borderRadius:9,border:"1px solid "+colors.border,background:priority.background}}><button onClick={()=>toggleTask(task)} title={task.status==="completed"?"Mark as pending":"Mark DONE"} style={{display:"grid",placeItems:"center",width:23,height:23,flexShrink:0,borderRadius:7,border:"1px solid "+priority.color,background:task.status==="completed"?priority.color:"transparent",color:task.status==="completed"?(isDark?"#111019":"#FFFFFF"):priority.color,cursor:"pointer"}}><CheckCircle2 size={13}/></button><div style={{flex:1,minWidth:0}}><div style={{fontSize:11.5,overflowWrap:"anywhere",textDecoration:task.status==="completed"?"line-through":"none"}}>{task.title}</div><div style={{fontSize:9.5,color:colors.muted,marginTop:3}}>{task.task_type}</div></div><span style={{fontSize:8.5,fontWeight:800,letterSpacing:.35,color:priority.color,background:priority.background,border:"1px solid "+priority.color+"55",padding:"3px 5px",borderRadius:5,flexShrink:0}}>{priority.label}</span><button onClick={()=>deleteTask(task)} title="Delete task" style={{...iconButton,width:22,height:22,flexShrink:0}}><Trash2 size={11}/></button></div>})}
        {tasks.filter(task=>task.due_date===selectedDate).length===0&&<p style={{fontSize:11,color:colors.muted,margin:"2px 0 8px"}}>Nothing scheduled for this date yet.</p>}</div>
        <button onClick={()=>{setDraft(d=>({...d,due_date:selectedDate}));setShowAdd(true);}} style={{...primaryButton,width:"100%",marginTop:9}}><Plus size={12} style={{display:"inline",verticalAlign:"middle",marginRight:4}}/>Add task for this date</button>
      </div>}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"12px 0 7px"}}><strong style={{fontSize:12}}>Upcoming tasks</strong><button onClick={()=>setShowAdd((v)=>!v)} style={smallButton}> <Plus size={12}/> Add</button></div>
      {showAdd&&<form onSubmit={addTask} style={{display:"grid",gap:7,padding:"9px 0 10px"}}><input required maxLength={200} value={draft.title} onChange={e=>setDraft(d=>({...d,title:e.target.value}))} placeholder="Assignment or study task" style={field}/><div style={{display:"flex",gap:6}}><input type="date" value={draft.due_date} onChange={e=>setDraft(d=>({...d,due_date:e.target.value}))} style={{...field,minWidth:0,flex:1}}/><select value={draft.task_type} onChange={e=>setDraft(d=>({...d,task_type:e.target.value}))} style={{...field,minWidth:0,flex:1}}><option value="assignment">Assignment</option><option value="exam">Exam</option><option value="study">Study</option><option value="project">Project</option><option value="other">Other</option></select></div><select value={draft.priority||"normal"} onChange={e=>setDraft(d=>({...d,priority:e.target.value}))} style={field}><option value="high">High priority</option><option value="normal">Moderate priority</option><option value="low">Low priority</option></select><button type="submit" style={primaryButton}>Save task</button></form>}
      <div style={{display:"grid",gap:7,maxHeight:154,overflowY:"auto"}}>{tasks.filter(t=>t.status!=="completed").slice(0,6).map(task=><div key={task.id} style={{display:"flex",alignItems:"center",gap:7,padding:"7px 8px",borderRadius:9,border:"1px solid "+colors.border}}><button onClick={()=>toggleTask(task)} title="Mark complete" style={{...iconButton,width:22,height:22}}><CheckCircle2 size={13}/></button><div style={{flex:1,minWidth:0}}><div style={{fontSize:11.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</div><div style={{fontSize:10,color:task.due_date&&task.due_date<today?colors.red:colors.faint}}>{prettyDate(task.due_date)} · {task.task_type}</div></div><button onClick={()=>deleteTask(task)} style={{...iconButton,width:22,height:22}} title="Delete task"><Trash2 size={12}/></button></div>)}{!loading&&tasks.filter(t=>t.status!=="completed").length===0&&<p style={{fontSize:11,color:colors.muted,margin:"8px 0"}}>No pending tasks. Add an assignment or study session.</p>}</div>
      {notice&&<p role="status" style={{fontSize:10.5,color:colors.muted,margin:"8px 0 0"}}>{notice}</p>}
      <button onClick={onGoToEducation} style={{...linkButton,marginTop:9}}>Open VANT Education <ArrowRight size={12}/></button>
    </>)}
    {widget("tracker","Study Tracker",BookOpen,<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>
        {[["Completed",completed,colors.green],["Pending",pending,colors.accent],["Overdue",overdue,colors.red],["Done this week",weekTasks,colors.text]].map(([label,value,color])=><div key={label} style={{padding:10,borderRadius:11,border:"1px solid "+colors.border,background:colors.soft}}><div style={{fontSize:10,color:colors.muted,marginBottom:4}}>{label}</div><strong style={{fontSize:23,color}}>{value}</strong></div>)}
      </div>
      <div style={{marginTop:11,padding:10,borderRadius:11,border:"1px solid "+colors.border}}><div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:7}}><span>Task completion</span><strong>{tasks.length?Math.round(completed/tasks.length*100):0}%</strong></div><div style={{height:6,borderRadius:8,background:colors.border,overflow:"hidden"}}><div style={{height:"100%",width:(tasks.length?completed/tasks.length*100:0)+"%",background:colors.accent,borderRadius:8}}/></div><p style={{fontSize:10.5,color:colors.muted,margin:"8px 0 0"}}>{materials.length} saved study materials in your Education library</p></div>
      <button onClick={load} style={{...linkButton,marginTop:9}}><RefreshCw size={12}/> Refresh stats</button>
    </>)}
    {widget("docs","Doc Files Cabinet",FolderOpen,<>
      <div style={{fontSize:10.5,color:colors.muted,marginBottom:8}}>Saved writing materials · {writingMaterials.length}</div>
      <div style={{display:"grid",gap:7,maxHeight:210,overflowY:"auto"}}>{writingMaterials.slice(0,7).map(item=><div key={item.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px",border:"1px solid "+colors.border,borderRadius:9}}><FileText size={16} color={colors.accent}/><div style={{minWidth:0,flex:1}}><div style={{fontSize:11.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.title}</div><div style={{fontSize:10,color:colors.faint}}>{item.topic||item.folder||"Writing"} · {prettyDate((item.updated_at||item.created_at||"").slice(0,10))}</div></div></div>)}{writingMaterials.length===0&&<p style={{fontSize:11,color:colors.muted,margin:"8px 0"}}>Saved essays, outlines, and drafts will appear here. Save a result from Essay Outline or Writing Assistant to add it.</p>}</div>
      <button onClick={onGoToEducation} style={{...linkButton,marginTop:9}}><FolderOpen size={12}/> Open document library</button>
      <button onClick={onGoToTools} style={{...linkButton,marginTop:5}}><PencilLine size={12}/> Go to writing tools</button>
    </>)}
    </div>
    {!embedded && <div style={{position:"fixed",right:18,bottom:18,zIndex:79,display:"flex",gap:7,flexDirection:"column",alignItems:"flex-end",pointerEvents:"none"}}>
      {([["calendar","Calendar",CalendarDays],["tracker","Study stats",BookOpen],["docs","Doc cabinet",FolderOpen]]).filter(([id])=>!open[id]).map(([id,label,Icon])=><button key={id} onClick={()=>openWidget(id)} style={{pointerEvents:"auto",display:"flex",alignItems:"center",gap:7,padding:"10px 12px",borderRadius:999,border:"1px solid "+colors.border,background:colors.card,color:colors.text,boxShadow:"0 6px 24px rgba(0,0,0,.15)",fontSize:11.5,fontWeight:650,cursor:"pointer"}}><Icon size={15} color={colors.accent}/>{label}</button>)}
    </div>}
  </>;

}
