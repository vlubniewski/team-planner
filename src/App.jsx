import { useState, useRef, useEffect } from "react";

const TEAM_MEMBERS = [
  { id: 1, name: "Ryan Geraghty", role: "Director, Software Development", color: "#6366F1", initials: "RG" },
  { id: 2, name: "Michael Santilli", role: "Sr. Web Developer", color: "#3B82F6", initials: "MS" },
  { id: 3, name: "John Kaeser", role: "Sr. Developer", color: "#10B981", initials: "JK" },
  { id: 4, name: "Jason Moore", role: "Web Developer", color: "#F59E0B", initials: "JM" },
];

const NUM_WEEKS = 16;

function getWeekLabel(offset) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + offset * 7);
  return d.toLocaleDateString("default", { month: "short", day: "numeric" });
}

function getMonthGroups() {
  const groups = [];
  let cur = null;
  for (let w = 0; w < NUM_WEEKS; w++) {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay() + w * 7);
    const key = d.toLocaleString("default", { month: "long", year: "numeric" });
    const label = d.toLocaleString("default", { month: "long" });
    if (!cur || cur.key !== key) { cur = { key, label, start: w, count: 1 }; groups.push(cur); }
    else cur.count++;
  }
  return groups;
}

const JIRA_BASE = "https://hmpglobal.atlassian.net/browse";
const SIDEBAR_W = 200;
const ROW_H = 44;
const HEADER_H = 56;

export default function App() {
  const [assignments, setAssignments] = useState([]);
  const [expanded, setExpanded] = useState({ 1: true, 2: true, 3: true, 4: true });
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ title: "", memberId: 1, startWeek: 0, duration: 2, fromJira: false, dueDateWeek: null });
  const [tooltip, setTooltip] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const gridRef = useRef(null);
  const nextId = useRef(300);

  const [colW, setColW] = useState(0);
  useEffect(() => {
    const measure = () => {
      if (gridRef.current) setColW((gridRef.current.offsetWidth - SIDEBAR_W) / NUM_WEEKS);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const weeks = Array.from({ length: NUM_WEEKS }, (_, i) => i);
  const monthGroups = getMonthGroups();

  const openAdd = (memberId, startWeek) => {
    setEditItem(null);
    setForm({ title: "", memberId, startWeek, duration: 2, fromJira: false, dueDateWeek: null });
    setShowModal(true);
  };
  const openEdit = (e, a) => {
    e.stopPropagation();
    setEditItem(a);
    setForm({ title: a.title, memberId: a.memberId, startWeek: a.startWeek, duration: a.duration, fromJira: a.fromJira, dueDateWeek: a.dueDateWeek ?? null });
    setShowModal(true);
  };
  const save = () => {
    if (!form.title.trim()) return;
    if (editItem) setAssignments(p => p.map(a => a.id === editItem.id ? { ...a, ...form } : a));
    else setAssignments(p => [...p, { id: nextId.current++, ...form }]);
    setShowModal(false);
  };
  const del = id => { setAssignments(p => p.filter(a => a.id !== id)); setShowModal(false); };

  const handleDragStart = (e, a) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDragging(a);
    setDragOffset(Math.floor((e.clientX - rect.left) / colW));
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDrop = (e, memberId, week) => {
    e.preventDefault();
    if (!dragging) return;
    const ns = Math.max(0, Math.min(NUM_WEEKS - dragging.duration, week - dragOffset));
    setAssignments(p => p.map(a => a.id === dragging.id ? { ...a, startWeek: ns, memberId } : a));
    setDragging(null);
  };

  const syncFromJira = async () => {
    setSyncing(true); setSyncStatus(null);
    try {
      const res = await fetch('/api/jira');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const today = new Date(); today.setHours(0,0,0,0); today.setDate(today.getDate() - today.getDay());
      const ja = (data.issues||[]).map(issue => {
        const { summary, assignee, duedate, created } = issue.fields;
        const member = TEAM_MEMBERS.find(m => assignee && m.name.toLowerCase().includes(assignee.displayName?.split(" ")[0].toLowerCase())) || TEAM_MEMBERS[0];
        let dueDateWeek = null;
        if (duedate) dueDateWeek = Math.max(0, Math.min(NUM_WEEKS-1, Math.round((new Date(duedate)-today)/(7*864e5))));
        return { id:`jira-${issue.id}`, title:summary, memberId:member.id, startWeek:null, duration:null, fromJira:true, jiraKey:issue.key, status:issue.fields.status?.name, dueDateWeek };
      });
      setAssignments(p => [...p.filter(a=>!a.fromJira), ...ja]);
      setSyncStatus({ type:"success", message:`Synced ${ja.length} stories from WOPS` });
    } catch(err) { setSyncStatus({ type:"error", message:`Sync failed: ${err.message}` }); }
    setSyncing(false);
  };

  const totalTasks = assignments.length;
  const jiraTasks = assignments.filter(a=>a.fromJira).length;
  const manualTasks = assignments.filter(a=>!a.fromJira).length;

  return (
    <div style={{ fontFamily:"'Inter','Segoe UI',sans-serif", background:"#0D0F14", height:"100vh", display:"flex", flexDirection:"column", color:"#C9D1D9", overflow:"hidden" }}>

      {/* Top Bar */}
      <div style={{ background:"#161B22", borderBottom:"1px solid #21262D", padding:"0 20px", display:"flex", alignItems:"center", height:48, flexShrink:0, gap:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginRight:32 }}>
          <div style={{ width:24, height:24, background:"linear-gradient(135deg,#6366F1,#3B82F6)", borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:"white" }}>T</div>
          <span style={{ fontSize:13, fontWeight:700, color:"#F0F6FC", letterSpacing:"-0.3px" }}>TeamPlanner</span>
        </div>
        <div style={{ flex:1 }} />
        <div style={{ display:"flex", gap:20, alignItems:"center", marginRight:16 }}>
          {[{label:"Total",value:totalTasks},{label:"Jira",value:jiraTasks,color:"#3B82F6"},{label:"Manual",value:manualTasks,color:"#6366F1"}].map(s=>(
            <div key={s.label} style={{ textAlign:"center" }}>
              <div style={{ fontSize:15, fontWeight:700, color:s.color||"#F0F6FC", lineHeight:1 }}>{s.value}</div>
              <div style={{ fontSize:10, color:"#484F58", marginTop:1 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <button onClick={syncFromJira} disabled={syncing} style={{ background:syncing?"#21262D":"linear-gradient(135deg,#1D6FE8,#3B82F6)", border:"1px solid #2D6DB5", color:"white", padding:"6px 14px", borderRadius:6, fontSize:12, fontWeight:600, cursor:syncing?"not-allowed":"pointer", display:"flex", alignItems:"center", gap:6, marginRight:8, opacity:syncing?0.7:1 }}>
          <span style={{ fontSize:13, display:"inline-block", animation:syncing?"spin 1s linear infinite":"none" }}>⟳</span>
          {syncing?"Syncing…":"Sync WOPS"}
        </button>
        <button onClick={()=>openAdd(1,0)} style={{ background:"#238636", border:"1px solid #2EA043", color:"white", padding:"6px 14px", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
          <span style={{ fontSize:16, lineHeight:1 }}>+</span> Add
        </button>
      </div>

      {syncStatus && (
        <div style={{ background:syncStatus.type==="success"?"#0D3321":"#3D1414", borderBottom:`1px solid ${syncStatus.type==="success"?"#2EA043":"#F85149"}`, padding:"6px 20px", fontSize:12, color:syncStatus.type==="success"?"#3FB950":"#F85149", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <span>{syncStatus.message}</span>
          <button onClick={()=>setSyncStatus(null)} style={{ background:"none", border:"none", color:"inherit", cursor:"pointer", fontSize:14 }}>✕</button>
        </div>
      )}

      {/* Gantt */}
      <div ref={gridRef} style={{ flex:1, overflow:"auto", position:"relative" }}>
        {colW > 0 && (
          <table style={{ width:"100%", borderCollapse:"collapse", tableLayout:"fixed" }}>
            <colgroup>
              <col style={{ width:SIDEBAR_W }} />
              {weeks.map(w=><col key={w} style={{ width:colW }} />)}
            </colgroup>
            <thead>
              {/* Month row */}
              <tr style={{ background:"#161B22" }}>
                <th style={{ borderBottom:"1px solid #21262D", borderRight:"1px solid #21262D", padding:"6px 14px", textAlign:"left", fontSize:11, fontWeight:700, color:"#484F58", letterSpacing:"0.06em", position:"sticky", top:0, zIndex:20, background:"#161B22" }}>TEAM</th>
                {monthGroups.map(g=>(
                  <th key={g.key} colSpan={g.count} style={{ borderBottom:"1px solid #21262D", borderRight:"1px solid #21262D", padding:"6px 10px", textAlign:"left", fontSize:11, fontWeight:700, color:"#8B949E", letterSpacing:"0.05em", position:"sticky", top:0, zIndex:19, background:"#161B22" }}>{g.label.toUpperCase()}</th>
                ))}
              </tr>
              {/* Week row */}
              <tr style={{ background:"#161B22" }}>
                <th style={{ borderBottom:"2px solid #30363D", borderRight:"1px solid #21262D", position:"sticky", top:28, zIndex:20, background:"#161B22" }} />
                {weeks.map(w=>(
                  <th key={w} style={{ borderBottom:"2px solid #30363D", borderRight:"1px solid #21262D", padding:"4px 0", textAlign:"center", fontSize:10, color:w===0?"#6366F1":"#484F58", fontWeight:w===0?700:400, background:w===0?"#1A1F2E":"#161B22", position:"sticky", top:28, zIndex:19 }}>
                    {w===0?"NOW":getWeekLabel(w)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEAM_MEMBERS.map(member => {
                const mTasks = assignments.filter(a=>a.memberId===member.id);
                const isExpanded = expanded[member.id];
                const totalWeeks = mTasks.filter(a=>a.duration).reduce((s,a)=>s+a.duration,0);
                const pct = Math.min(100, Math.round((totalWeeks/NUM_WEEKS)*100));
                const barColor = pct>80?"#F85149":pct>60?"#F59E0B":member.color;

                return [
                  /* Collapsed header row */
                  <tr key={`hdr-${member.id}`}
                    style={{ background:"#161B22", cursor:"pointer" }}
                    onClick={()=>setExpanded(p=>({...p,[member.id]:!p[member.id]}))}
                  >
                    <td style={{ borderBottom:"1px solid #21262D", borderRight:"1px solid #21262D", padding:"0 12px", height:ROW_H, position:"sticky", left:0, zIndex:10, background:"#161B22" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:10, color:"#484F58", userSelect:"none", width:12 }}>{isExpanded?"▾":"▸"}</span>
                        <div style={{ width:28, height:28, borderRadius:7, background:`${member.color}22`, border:`1px solid ${member.color}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:member.color, flexShrink:0 }}>{member.initials}</div>
                        <div style={{ minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:"#F0F6FC", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{member.name}</div>
                          <div style={{ fontSize:10, color:"#484F58" }}>{mTasks.length} task{mTasks.length!==1?"s":""}</div>
                        </div>
                        <div style={{ marginLeft:"auto", display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3, paddingLeft:8 }}>
                          <span style={{ fontSize:10, fontWeight:700, color:barColor }}>{pct}%</span>
                          <div style={{ width:48, height:3, background:"#21262D", borderRadius:2 }}>
                            <div style={{ height:"100%", width:`${pct}%`, background:barColor, borderRadius:2 }} />
                          </div>
                        </div>
                      </div>
                    </td>
                    {weeks.map(w=>(
                      <td key={w}
                        style={{ borderBottom:"1px solid #21262D", borderRight:"1px solid #21262D", background:w===0?"#1A1F2E22":"transparent" }}
                        onDragOver={e=>e.preventDefault()}
                        onDrop={e=>handleDrop(e,member.id,w)}
                      />
                    ))}
                  </tr>,

                  /* Expanded task rows */
                  isExpanded && mTasks.length===0 && (
                    <tr key={`empty-${member.id}`}>
                      <td style={{ borderBottom:"1px solid #21262D", borderRight:"1px solid #21262D", padding:"0 12px", height:36, position:"sticky", left:0, zIndex:10, background:"#0D0F14" }}>
                        <span style={{ fontSize:10, color:"#484F58", fontStyle:"italic" }}>No tasks</span>
                      </td>
                      {weeks.map(w=>(
                        <td key={w}
                          style={{ borderBottom:"1px solid #21262D", borderRight:"1px solid #21262D", background:w===0?"#1A1F2E11":"transparent", cursor:"crosshair" }}
                          onClick={()=>openAdd(member.id,w)}
                          onDragOver={e=>e.preventDefault()}
                          onDrop={e=>handleDrop(e,member.id,w)}
                        />
                      ))}
                    </tr>
                  ),

                  isExpanded && mTasks.map(a => (
                    <tr key={`task-${a.id}`}>
                      <td style={{ borderBottom:"1px solid #21262D", borderRight:"1px solid #21262D", padding:"0 12px 0 36px", height:36, position:"sticky", left:0, zIndex:10, background:"#0D0F14" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          {a.fromJira && <span style={{ fontSize:8, fontWeight:700, background:"#1D3557", color:"#3B82F6", padding:"1px 4px", borderRadius:3, flexShrink:0 }}>J</span>}
                          <span style={{ fontSize:11, color:"#8B949E", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", maxWidth:130 }}>{a.title}</span>
                        </div>
                      </td>
                      {weeks.map(w => {
                        // Jira due-date marker
                        const isDueWeek = a.fromJira && a.dueDateWeek===w;
                        // Regular bar: start cell
                        const isStart = !a.fromJira && a.startWeek===w;
                        const spanLen = !a.fromJira ? a.duration : 0;

                        return (
                          <td key={w}
                            colSpan={isStart ? spanLen : 1}
                            style={{
                              borderBottom:"1px solid #21262D",
                              borderRight: isStart && spanLen>1 ? "none" : "1px solid #21262D",
                              background:w===0?"#1A1F2E11":"transparent",
                              padding: isStart||isDueWeek ? "5px 3px" : 0,
                              cursor: isStart ? "grab" : "crosshair",
                              position:"relative",
                            }}
                            onClick={isStart||isDueWeek ? (e=>openEdit(e,a)) : (()=>openAdd(member.id,w))}
                            onDragOver={e=>e.preventDefault()}
                            onDrop={e=>handleDrop(e,member.id,w)}
                          >
                            {isStart && (
                              <div
                                draggable
                                onDragStart={e=>handleDragStart(e,a)}
                                onDragEnd={()=>setDragging(null)}
                                onMouseEnter={e=>setTooltip({id:a.id,x:e.clientX,y:e.clientY,a})}
                                onMouseLeave={()=>setTooltip(null)}
                                style={{
                                  height:26, borderRadius:5,
                                  background:`linear-gradient(135deg,${member.color}EE,${member.color}99)`,
                                  borderLeft:`3px solid ${member.color}`,
                                  display:"flex", alignItems:"center", padding:"0 8px",
                                  boxShadow:`0 1px 6px ${member.color}44`,
                                  opacity: dragging?.id===a.id?0.4:1,
                                  cursor:"grab",
                                }}
                              >
                                <span style={{ fontSize:11, fontWeight:600, color:"white", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", flex:1, textShadow:"0 1px 2px rgba(0,0,0,.5)" }}>{a.title}</span>
                                <span style={{ fontSize:9, color:"rgba(255,255,255,.55)", paddingLeft:6, flexShrink:0 }}>{a.duration}w</span>
                              </div>
                            )}
                            {isDueWeek && (
                              <div
                                onClick={e=>openEdit(e,a)}
                                onMouseEnter={e=>setTooltip({id:a.id,x:e.clientX,y:e.clientY,a})}
                                onMouseLeave={()=>setTooltip(null)}
                                style={{
                                  display:"flex", alignItems:"center", justifyContent:"center",
                                  height:26, borderRadius:5,
                                  background:`${member.color}22`,
                                  border:`1px dashed ${member.color}88`,
                                  cursor:"pointer",
                                }}
                              >
                                <span style={{ fontSize:9, fontWeight:700, color:member.color }}>DUE</span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      {tooltip && (
        <div style={{ position:"fixed", left:tooltip.x+14, top:tooltip.y-70, background:"#1C2128", border:"1px solid #30363D", borderRadius:8, padding:"10px 14px", fontSize:12, pointerEvents:"none", zIndex:1000, boxShadow:"0 8px 32px rgba(0,0,0,.6)" }}>
          <div style={{ fontWeight:700, color:"#F0F6FC", marginBottom:4 }}>{tooltip.a.title}</div>
          <div style={{ color:"#8B949E", fontSize:11 }}>{TEAM_MEMBERS.find(m=>m.id===tooltip.a.memberId)?.name}</div>
          {tooltip.a.duration && <div style={{ color:"#484F58", fontSize:10, marginTop:3 }}>{tooltip.a.duration} week{tooltip.a.duration>1?"s":""} · starts {getWeekLabel(tooltip.a.startWeek)}</div>}
          {tooltip.a.dueDateWeek!=null && <div style={{ color:"#F59E0B", fontSize:10, marginTop:3 }}>Due {getWeekLabel(tooltip.a.dueDateWeek)}</div>}
          {tooltip.a.fromJira && tooltip.a.jiraKey && (
            <a href={`${JIRA_BASE}/${tooltip.a.jiraKey}`} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{ display:"block", color:"#3B82F6", fontSize:10, marginTop:4, textDecoration:"none" }}>
              ↗ Open in Jira · {tooltip.a.jiraKey}
            </a>
          )}
          {tooltip.a.status && <div style={{ color:"#8B949E", fontSize:10 }}>Status: {tooltip.a.status}</div>}
        </div>
      )}

      {showModal && (
        <div onClick={e=>e.target===e.currentTarget&&setShowModal(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, backdropFilter:"blur(4px)" }}>
          <div style={{ background:"#161B22", border:"1px solid #30363D", borderRadius:12, padding:24, width:400, boxShadow:"0 24px 60px rgba(0,0,0,.7)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h2 style={{ margin:0, fontSize:15, fontWeight:700, color:"#F0F6FC" }}>{editItem?"Edit Assignment":"New Assignment"}</h2>
              <button onClick={()=>setShowModal(false)} style={{ background:"none", border:"none", color:"#8B949E", cursor:"pointer", fontSize:18 }}>✕</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {[
                { label:"Title", el:<input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Homepage Redesign" autoFocus style={{ display:"block",width:"100%",marginTop:6,background:"#0D1117",border:"1px solid #30363D",borderRadius:6,padding:"8px 10px",color:"#F0F6FC",fontSize:13,outline:"none",boxSizing:"border-box" }} /> },
              ].map(({label,el})=>(
                <div key={label}><label style={{ fontSize:11,color:"#8B949E",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em" }}>{label}</label>{el}</div>
              ))}
              <div>
                <label style={{ fontSize:11,color:"#8B949E",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em" }}>Assign To</label>
                <select value={form.memberId} onChange={e=>setForm(f=>({...f,memberId:Number(e.target.value)}))} style={{ display:"block",width:"100%",marginTop:6,background:"#0D1117",border:"1px solid #30363D",borderRadius:6,padding:"8px 10px",color:"#F0F6FC",fontSize:13,outline:"none",boxSizing:"border-box",cursor:"pointer" }}>
                  {TEAM_MEMBERS.map(m=><option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
                </select>
              </div>
              {!form.fromJira && (
                <div style={{ display:"flex", gap:10 }}>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:11,color:"#8B949E",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em" }}>Start Week</label>
                    <select value={form.startWeek} onChange={e=>setForm(f=>({...f,startWeek:Number(e.target.value)}))} style={{ display:"block",width:"100%",marginTop:6,background:"#0D1117",border:"1px solid #30363D",borderRadius:6,padding:"8px 10px",color:"#F0F6FC",fontSize:13,outline:"none",boxSizing:"border-box",cursor:"pointer" }}>
                      {Array.from({length:NUM_WEEKS},(_,i)=>i).map(w=><option key={w} value={w}>{w===0?"This week":`+${w}w · ${getWeekLabel(w)}`}</option>)}
                    </select>
                  </div>
                  <div style={{ flex:1 }}>
                    <label style={{ fontSize:11,color:"#8B949E",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em" }}>Duration</label>
                    <select value={form.duration} onChange={e=>setForm(f=>({...f,duration:Number(e.target.value)}))} style={{ display:"block",width:"100%",marginTop:6,background:"#0D1117",border:"1px solid #30363D",borderRadius:6,padding:"8px 10px",color:"#F0F6FC",fontSize:13,outline:"none",boxSizing:"border-box",cursor:"pointer" }}>
                      {[1,2,3,4,5,6,8,10,12].map(d=><option key={d} value={d}>{d} week{d>1?"s":""}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                {editItem && <button onClick={()=>del(editItem.id)} style={{ flex:1,background:"transparent",border:"1px solid #F8514933",color:"#F85149",padding:8,borderRadius:6,fontSize:12,cursor:"pointer",fontWeight:600 }}>Delete</button>}
                <button onClick={save} style={{ flex:2,background:"#238636",border:"1px solid #2EA043",color:"white",padding:8,borderRadius:6,fontSize:13,cursor:"pointer",fontWeight:700 }}>              {editItem?"Save Changes":"Add Assignment"}</button>
              </div>
              {editItem?.fromJira && editItem?.jiraKey && (
                <a href={`${JIRA_BASE}/${editItem.jiraKey}`} target="_blank" rel="noreferrer" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, marginTop:10, color:"#3B82F6", fontSize:12, textDecoration:"none", padding:"7px", borderRadius:6, border:"1px solid #1D3557", background:"#0D1117" }}>
                  <span style={{ fontSize:13 }}>↗</span> View {editItem.jiraKey} in Jira
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing:border-box }
        ::-webkit-scrollbar { width:6px; height:6px }
        ::-webkit-scrollbar-track { background:#0D0F14 }
        ::-webkit-scrollbar-thumb { background:#30363D; border-radius:3px }
        tr:hover > td { background:#ffffff05 !important }
      `}</style>
    </div>
  );
}