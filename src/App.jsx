import { useState, useRef, useEffect, useCallback } from "react";

const TEAM_MEMBERS = [
  { id: 1, name: "Ryan Geraghty",   role: "Director, Software Development", color: "#4F46E5", initials: "RG" },
  { id: 2, name: "Michael Santilli", role: "Sr. Web Developer",              color: "#1D6FE8", initials: "MS" },
  { id: 3, name: "John Kaeser",      role: "Sr. Developer",                  color: "#059669", initials: "JK" },
  { id: 4, name: "Jason Moore",      role: "Web Developer",                  color: "#D97706", initials: "JM" },
];

const JIRA_BASE        = "https://hmpglobal.atlassian.net/browse";
const SIDEBAR_W        = 210;
const TODAY            = new Date(); TODAY.setHours(0,0,0,0);
const TODAY_KEY        = TODAY.toISOString().slice(0,10);
const DONE_COLOR       = "#16A34A";
const BRAND_BLUE       = "#0057B8";
const BRAND_NAVY       = "#162040";
const MILESTONE_COLORS = ["#D97706","#4F46E5","#DB2777","#059669","#DC2626","#0057B8"];
const MILESTONE_LEGEND = {
  "#D97706": "Marketing",
  "#4F46E5": "Product",
  "#DB2777": "Design",
  "#059669": "Other",
  "#DC2626": "Critical",
  "#0057B8": "Engineering",
};

const C = {
  pageBg:       "#EEF2F7",
  surface:      "#FFFFFF",
  surfaceAlt:   "#F8FAFC",
  surfaceHdr:   "#F1F5F9",
  border:       "#E2E8F0",
  borderMid:    "#CBD5E1",
  textPrimary:  "#0F172A",
  textSecond:   "#475569",
  textMuted:    "#94A3B8",
  textDisabled: "#CBD5E1",
  todayBg:      "#EFF6FF",
  todayText:    BRAND_BLUE,
};

// ─── helpers ────────────────────────────────────────────────────────────────
function dateKey(d)      { return new Date(d).toISOString().slice(0,10); }
function isWeekend(d)    { const day = new Date(d).getDay(); return day===0||day===6; }
function addDays(d, n)   { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function fmtDate(key)    { return new Date(key+"T12:00:00").toLocaleDateString("default",{month:"short",day:"numeric"}); }
function fmtDateLong(key){ return new Date(key+"T12:00:00").toLocaleDateString("default",{month:"short",day:"numeric",year:"numeric"}); }

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return mobile;
}

function buildDays(monthOffset, numMonths) {
  const days = [];
  const base = new Date(TODAY.getFullYear(), TODAY.getMonth() + monthOffset, 1);
  for (let m = 0; m < numMonths; m++) {
    const month = new Date(base.getFullYear(), base.getMonth() + m, 1);
    const dim   = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= dim; d++) {
      const date = new Date(month.getFullYear(), month.getMonth(), d);
      if (!isWeekend(date)) days.push(date);
    }
  }
  return days;
}
function getMonthGroups(days) {
  const groups=[]; let cur=null;
  days.forEach((d,i)=>{
    const key=`${d.getFullYear()}-${d.getMonth()}`;
    const label=d.toLocaleString("default",{month:"long",year:"numeric"});
    if(!cur||cur.key!==key){cur={key,label,start:i,count:1};groups.push(cur);}else cur.count++;
  });
  return groups;
}
function getWeekGroups(days) {
  const groups=[]; let cur=null;
  days.forEach((d,i)=>{
    const jan1=new Date(d.getFullYear(),0,1);
    const wk=Math.ceil(((d-jan1)/86400000+jan1.getDay()+1)/7);
    const key=`${d.getFullYear()}-${wk}`;
    if(!cur||cur.key!==key){cur={key,label:d.toLocaleDateString("default",{month:"short",day:"numeric"}),start:i,count:1};groups.push(cur);}else cur.count++;
  });
  return groups;
}
function getBarSpan(startKey, endKey, dayKeys) {
  const sIdx=dayKeys.findIndex(k=>k>=startKey);
  let eIdx=-1;
  for(let i=dayKeys.length-1;i>=0;i--){if(dayKeys[i]<=endKey){eIdx=i;break;}}
  if(sIdx===-1||eIdx===-1||eIdx<sIdx) return null;
  return {sIdx,span:eIdx-sIdx+1};
}

// ─── tiny shared components ──────────────────────────────────────────────────
function SaveStatus({status}){
  const s={saving:{color:C.textMuted},saved:{color:DONE_COLOR},error:{color:"#DC2626"}};
  const l={saving:"Saving…",saved:"✓ Saved",error:"✕ Save failed"};
  if(!status) return null;
  return(
    <div style={{display:"flex",alignItems:"center",gap:5,fontSize:11,...s[status]}}>
      {status==="saving"&&<span style={{display:"inline-block",animation:"spin 1s linear infinite"}}>⟳</span>}
      {l[status]}
    </div>
  );
}
function Pill({label,value,color}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:4,background:`${color}12`,border:`1px solid ${color}30`,borderRadius:20,padding:"3px 9px"}}>
      <span style={{fontSize:13,fontWeight:700,color,lineHeight:1}}>{value}</span>
      <span style={{fontSize:10,color:C.textSecond,fontWeight:500}}>{label}</span>
    </div>
  );
}

// ─── mobile task card ────────────────────────────────────────────────────────
function MobileTaskCard({a, member, onEdit}){
  const isManual   = !a.fromJira;
  const isOverdue  = !a.isDone && a.dueDateKey && a.dueDateKey < TODAY_KEY;
  const bgColor    = isManual ? `${member.color}08` : C.surface;
  const borderLeft = isManual ? `3px solid ${member.color}` : `3px solid ${member.color}20`;

  return(
    <div
      onClick={e=>onEdit(e,a)}
      style={{
        display:"flex", alignItems:"flex-start", gap:10,
        padding:"10px 14px", background:bgColor,
        borderLeft, borderBottom:`1px solid ${C.border}`,
        cursor:"pointer", minHeight:isManual?52:40,
      }}
    >
      {/* badge */}
      {isManual ? (
        <span style={{fontSize:9,fontWeight:700,background:`${member.color}18`,color:member.color,padding:"2px 5px",borderRadius:4,flexShrink:0,border:`1px solid ${member.color}30`,marginTop:2}}>◆</span>
      ):(
        <span style={{fontSize:9,fontWeight:700,background:a.isDone?"#F0FDF4":isOverdue?"#FEF2F2":"#EFF6FF",color:a.isDone?DONE_COLOR:isOverdue?"#DC2626":"#2563EB",padding:"2px 4px",borderRadius:4,flexShrink:0,marginTop:2}}>
          {a.isDone?"✓":"J"}
        </span>
      )}

      {/* content */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{
          fontSize:isManual?13:11, fontWeight:isManual?600:400,
          color:isManual?(a.isDone?C.textMuted:BRAND_NAVY):(a.isDone?C.textDisabled:isOverdue?"#DC2626":C.textSecond),
          textDecoration:a.isDone?"line-through":"none",
          lineHeight:1.35, wordBreak:"break-word",
        }}>{a.title}</div>

        {/* date / status chips */}
        <div style={{display:"flex",gap:6,marginTop:5,flexWrap:"wrap"}}>
          {isManual && a.startKey && (
            <span style={{fontSize:10,color:member.color,background:`${member.color}12`,borderRadius:4,padding:"2px 6px",fontWeight:500}}>
              {fmtDate(a.startKey)} → {fmtDate(a.endKey)}
            </span>
          )}
          {!isManual && a.dueDateKey && !a.isDone && (
            <span style={{fontSize:10,color:isOverdue?"#DC2626":"#D97706",background:isOverdue?"#FEF2F2":"#FFFBEB",borderRadius:4,padding:"2px 6px",fontWeight:600}}>
              {isOverdue?"Overdue · ":"Due "}{fmtDate(a.dueDateKey)}
            </span>
          )}
          {a.isDone && a.resolvedKey && (
            <span style={{fontSize:10,color:DONE_COLOR,background:"#F0FDF4",borderRadius:4,padding:"2px 6px",fontWeight:500}}>
              Done {fmtDate(a.resolvedKey)}
            </span>
          )}
          {a.status && !a.isDone && a.fromJira && (
            <span style={{fontSize:10,color:C.textMuted,background:C.surfaceAlt,borderRadius:4,padding:"2px 6px"}}>
              {a.status}
            </span>
          )}
          {a.fromJira && a.jiraKey && (
            <span style={{fontSize:10,color:BRAND_BLUE,padding:"2px 0",fontWeight:500}}>{a.jiraKey}</span>
          )}
        </div>
      </div>

      <span style={{fontSize:16,color:C.textDisabled,flexShrink:0,marginTop:2}}>›</span>
    </div>
  );
}

// ─── mobile milestone strip ──────────────────────────────────────────────────
function MobileMilestoneStrip({milestones, monthLabel, onAdd, onEdit}){
  const sorted = [...milestones].sort((a,b)=>a.startKey.localeCompare(b.startKey));
  return(
    <div style={{background:"#FFFBEB",borderBottom:`1px solid #FDE68A`,padding:"8px 14px",flexShrink:0}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:sorted.length?8:0}}>
        <span style={{fontSize:9,fontWeight:700,color:"#92400E",letterSpacing:"0.07em"}}>🚩 MILESTONES</span>
        <button onClick={()=>onAdd(TODAY_KEY)} style={{marginLeft:"auto",background:"none",border:"1px solid #D97706",color:"#D97706",fontSize:10,padding:"2px 8px",borderRadius:5,cursor:"pointer",fontWeight:700}}>+ Add</button>
      </div>
      {sorted.length>0&&(
        <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:2}}>
          {sorted.map(ms=>(
            <div key={ms.id} onClick={e=>onEdit(e,ms)}
              style={{flexShrink:0,display:"flex",alignItems:"center",gap:5,background:`${ms.jiraKey}15`,border:`1.5px solid ${ms.jiraKey}`,borderRadius:7,padding:"5px 10px",cursor:"pointer"}}>
              <span style={{fontSize:10}}>🚩</span>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:ms.jiraKey,whiteSpace:"nowrap"}}>{ms.title}</div>
                <div style={{fontSize:9,color:C.textMuted,marginTop:1}}>{fmtDateLong(ms.startKey)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {sorted.length===0&&(
        <div style={{fontSize:10,color:"#92400E",opacity:0.5,fontStyle:"italic"}}>No milestones yet — tap + Add</div>
      )}
      <div style={{display:"flex",flexWrap:"wrap",gap:"3px 10px",marginTop:7,paddingTop:6,borderTop:"1px solid #FDE68A"}}>
        {MILESTONE_COLORS.map(c=>(
          <div key={c} style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:c,display:"inline-block",flexShrink:0}}/>
            <span style={{fontSize:9,color:"#92400E",opacity:0.8}}>{MILESTONE_LEGEND[c]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── main app ────────────────────────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile();

  const [monthOffset,       setMonthOffset]       = useState(0);
  const [assignments,       setAssignments]       = useState([]);
  const [expanded,          setExpanded]          = useState({1:true,2:true,3:true,4:true});
  const [showDone,          setShowDone]          = useState(true);
  const [strategicMode,     setStrategicMode]     = useState(true);
  const [showModal,         setShowModal]         = useState(false);
  const [editItem,          setEditItem]          = useState(null);
  const [form,              setForm]              = useState({title:"",memberId:1,startKey:TODAY_KEY,endKey:dateKey(addDays(TODAY,4)),fromJira:false,dueDateKey:null});
  const [tooltip,           setTooltip]           = useState(null);
  const [syncing,           setSyncing]           = useState(false);
  const [syncStatus,        setSyncStatus]        = useState(null);
  const [saveStatus,        setSaveStatus]        = useState(null);
  const [loading,           setLoading]           = useState(true);
  const [showMilestoneModal,setShowMilestoneModal]= useState(false);
  const [editMilestone,     setEditMilestone]     = useState(null);
  const [milestoneForm,     setMilestoneForm]     = useState({title:"",dateKey:TODAY_KEY,color:"#D97706"});

  const gridRef   = useRef(null);
  const nextId    = useRef(300);
  const [colW,    setColW] = useState(0);
  const saveTimer = useRef(null);

  const DAYS        = buildDays(monthOffset, 2);
  const NUM_DAYS    = DAYS.length;
  const monthGroups = getMonthGroups(DAYS);
  const weekGroups  = getWeekGroups(DAYS);
  const dayKeys     = DAYS.map(d => dateKey(d));
  const milestones  = assignments.filter(a => a.status === "MILESTONE");
  const monthLabel  = monthGroups.map(g => g.label).join(" – ");

  // stats
  const jiraTasks   = assignments.filter(a => a.fromJira && !a.isDone).length;
  const doneTasks   = assignments.filter(a => a.isDone).length;
  const manualTasks = assignments.filter(a => !a.fromJira && a.status !== "MILESTONE").length;

  // column width measurement (desktop only)
  useEffect(()=>{
    const measure=()=>{
      if(gridRef.current&&gridRef.current.offsetWidth>0)
        setColW((gridRef.current.offsetWidth-SIDEBAR_W)/NUM_DAYS);
    };
    measure();
    const t=setTimeout(measure,100);
    window.addEventListener("resize",measure);
    return()=>{clearTimeout(t);window.removeEventListener("resize",measure);};
  },[monthOffset,loading,isMobile]);

  // initial load
  useEffect(()=>{
    const load=async()=>{
      setLoading(true);
      try{
        const res=await fetch("/api/assignments");
        const data=await res.json();
        let saved=[];
        if(Array.isArray(data)){
          saved=data.map(r=>({
            id:r.id,title:r.title,memberId:r.member_id,
            startKey:r.start_key,endKey:r.end_key,
            fromJira:r.from_jira,jiraKey:r.jira_key,
            status:r.status,dueDateKey:r.due_date_key,
            resolvedKey:r.resolved_key,isDone:r.is_done,
          }));
        }
        const [activeRes,doneRes]=await Promise.all([
          fetch(`/api/jira?jql=${encodeURIComponent('status in ("Ready to Work","In Progress","Testing","Ready for Release","Selected for Development") AND assignee is not EMPTY ORDER BY duedate ASC')}`),
          fetch(`/api/jira?jql=${encodeURIComponent('status in ("Done","Deployed") AND assignee is not EMPTY AND resolutiondate >= -30d ORDER BY resolutiondate DESC')}`),
        ]);
        const activeData=await activeRes.json();
        const doneData=await doneRes.json();
        const mapIssue=(issue,isDone)=>{
          const{summary,assignee,duedate}=issue.fields;
          const member=TEAM_MEMBERS.find(m=>assignee&&m.name.toLowerCase().includes(assignee.displayName?.split(" ")[0].toLowerCase()));
          if(!member) return null;
          let dueDateKey=null;
          if(duedate){const dd=new Date(duedate);dd.setHours(0,0,0,0);dueDateKey=dateKey(dd);}
          let resolvedKey=null;
          const rr=issue.fields.transitionDate||issue.fields.resolutiondate;
          if(rr){const rd=new Date(rr);rd.setHours(0,0,0,0);resolvedKey=dateKey(rd);}
          return{id:`jira-${issue.id}`,title:summary,memberId:member.id,startKey:null,endKey:null,fromJira:true,jiraKey:issue.key,status:issue.fields.status?.name,dueDateKey,resolvedKey,isDone};
        };
        const jiraItems=[
          ...(activeData.issues||[]).map(i=>mapIssue(i,false)),
          ...(doneData.issues||[]).map(i=>mapIssue(i,true)),
        ].filter(Boolean);
        const merged=[...saved.filter(a=>!a.fromJira),...jiraItems];
        setAssignments(merged);
        await fetch("/api/assignments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({assignments:merged})});
      }catch(e){console.error("Load failed",e);}
      setLoading(false);
    };
    load();
  },[]);

  const persistAssignments=useCallback(async(list)=>{
    setSaveStatus("saving");
    try{
      const res=await fetch("/api/assignments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({assignments:list})});
      if(!res.ok) throw new Error("Save failed");
      setSaveStatus("saved");
      setTimeout(()=>setSaveStatus(null),2000);
    }catch{setSaveStatus("error");}
  },[]);

  const updateAssignments=useCallback((updater)=>{
    setAssignments(prev=>{
      const next=typeof updater==="function"?updater(prev):updater;
      clearTimeout(saveTimer.current);
      saveTimer.current=setTimeout(()=>persistAssignments(next),600);
      return next;
    });
  },[persistAssignments]);

  // assignment modal
  const openAdd=(memberId,dk)=>{
    setEditItem(null);
    setForm({title:"",memberId,startKey:dk,endKey:dateKey(addDays(new Date(dk+"T12:00:00"),4)),fromJira:false,dueDateKey:null});
    setShowModal(true);
  };
  const openEdit=(e,a)=>{
    e.stopPropagation();
    setEditItem(a);
    setForm({title:a.title,memberId:a.memberId,startKey:a.startKey,endKey:a.endKey,fromJira:a.fromJira,dueDateKey:a.dueDateKey??null});
    setShowModal(true);
  };
  const save=()=>{
    if(!form.title.trim()||form.endKey<form.startKey) return;
    if(editItem) updateAssignments(p=>p.map(a=>a.id===editItem.id?{...a,...form}:a));
    else updateAssignments(p=>[...p,{id:`manual-${nextId.current++}-${Date.now()}`,...form}]);
    setShowModal(false);
  };
  const del=id=>{updateAssignments(p=>p.filter(a=>a.id!==id));setShowModal(false);};
  const cloneItem=()=>{
    // Switch modal to "add" mode pre-filled with current form values
    setEditItem(null);
    setForm(f=>({...f,title:f.title+" (copy)"}));
  };

  // milestone modal
  const openAddMilestone=(dk)=>{
    setEditMilestone(null);
    setMilestoneForm({title:"",dateKey:dk||TODAY_KEY,color:"#D97706"});
    setShowMilestoneModal(true);
  };
  const openEditMilestone=(e,m)=>{
    e.stopPropagation();
    setEditMilestone(m);
    setMilestoneForm({title:m.title,dateKey:m.startKey,color:m.jiraKey||"#D97706"});
    setShowMilestoneModal(true);
  };
  const saveMilestone=()=>{
    if(!milestoneForm.title.trim()) return;
    const ms={id:editMilestone?editMilestone.id:`milestone-${nextId.current++}-${Date.now()}`,title:milestoneForm.title,memberId:null,startKey:milestoneForm.dateKey,endKey:milestoneForm.dateKey,fromJira:false,jiraKey:milestoneForm.color,status:"MILESTONE",dueDateKey:null,resolvedKey:null,isDone:false};
    if(editMilestone) updateAssignments(p=>p.map(a=>a.id===editMilestone.id?ms:a));
    else updateAssignments(p=>[...p,ms]);
    setShowMilestoneModal(false);
  };
  const delMilestone=id=>{updateAssignments(p=>p.filter(a=>a.id!==id));setShowMilestoneModal(false);};

  const syncFromJira=async()=>{
    setSyncing(true);setSyncStatus(null);
    try{
      const aJql=encodeURIComponent('status in ("Ready to Work","In Progress","Testing","Ready for Release","Selected for Development") AND assignee is not EMPTY ORDER BY duedate ASC');
      const dJql=encodeURIComponent('status in ("Done","Deployed") AND assignee is not EMPTY AND resolutiondate >= -30d ORDER BY resolutiondate DESC');
      const[aRes,dRes]=await Promise.all([fetch(`/api/jira?jql=${aJql}`),fetch(`/api/jira?jql=${dJql}`)]);
      const aData=await aRes.json();
      const dData=await dRes.json();
      const mapIssue=(issue,isDone)=>{
        const{summary,assignee,duedate,resolutiondate}=issue.fields;
        const member=TEAM_MEMBERS.find(m=>assignee&&m.name.toLowerCase().includes(assignee.displayName?.split(" ")[0].toLowerCase()));
        if(!member) return null;
        let dueDateKey=null;
        if(duedate){const dd=new Date(duedate);dd.setHours(0,0,0,0);dueDateKey=dateKey(dd);}
        let resolvedKey=null;
        if(resolutiondate){const rd=new Date(resolutiondate);rd.setHours(0,0,0,0);resolvedKey=dateKey(rd);}
        return{id:`jira-${issue.id}`,title:summary,memberId:member.id,startKey:null,endKey:null,fromJira:true,jiraKey:issue.key,status:issue.fields.status?.name,dueDateKey,resolvedKey,isDone:isDone||false};
      };
      const active=(aData.issues||[]).map(i=>mapIssue(i,false)).filter(Boolean);
      const done=(dData.issues||[]).map(i=>mapIssue(i,true)).filter(Boolean);
      updateAssignments(p=>[...p.filter(a=>!a.fromJira),...active,...done]);
      setSyncStatus({type:"success",message:`Synced ${active.length} active + ${done.length} completed from WOPS`});
    }catch(err){setSyncStatus({type:"error",message:`Sync failed: ${err.message}`});}
    setSyncing(false);
  };

  // shared modal styles
  const inputStyle={display:"block",width:"100%",marginTop:5,background:C.surfaceAlt,border:`1px solid ${C.border}`,borderRadius:7,padding:"9px 11px",color:C.textPrimary,fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit"};
  const labelStyle={fontSize:11,color:C.textSecond,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"};

  // ── shared top-bar buttons ─────────────────────────────────────────────────
  const TopBarDesktop = (
    <div style={{background:BRAND_NAVY,padding:"0 20px",display:"flex",alignItems:"center",height:52,flexShrink:0,gap:10,borderRadius:"14px 14px 0 0"}}>
      {/* wordmark */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginRight:20}}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 3h3v6h8V3h3v14h-3v-5H6v5H3V3z" fill={BRAND_BLUE}/></svg>
        <span style={{fontSize:13,fontWeight:800,color:"#FFFFFF",letterSpacing:"-0.3px"}}>HMP</span>
        <span style={{fontSize:13,fontWeight:400,color:"rgba(255,255,255,0.6)"}}>Global</span>
        <span style={{width:1,height:16,background:"rgba(255,255,255,0.2)",margin:"0 6px"}}/>
        <span style={{fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.5)"}}>Team Planner</span>
      </div>
      {/* date nav */}
      <div style={{display:"flex",alignItems:"center",gap:4,background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,padding:"3px 6px"}}>
        <button onClick={()=>setMonthOffset(o=>o-1)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.6)",cursor:"pointer",fontSize:15,padding:"1px 5px",lineHeight:1}}>‹</button>
        <span style={{fontSize:12,fontWeight:600,color:"#FFF",minWidth:170,textAlign:"center"}}>{monthLabel}</span>
        <button onClick={()=>setMonthOffset(o=>o+1)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.6)",cursor:"pointer",fontSize:15,padding:"1px 5px",lineHeight:1}}>›</button>
      </div>
      {monthOffset!==0&&<button onClick={()=>setMonthOffset(0)} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.7)",fontSize:11,padding:"3px 9px",borderRadius:6,cursor:"pointer"}}>Today</button>}
      <button onClick={()=>setShowDone(v=>!v)} style={{background:showDone?`${DONE_COLOR}20`:"rgba(255,255,255,0.08)",border:`1px solid ${showDone?DONE_COLOR+"50":"rgba(255,255,255,0.15)"}`,color:showDone?"#4ADE80":"rgba(255,255,255,0.4)",fontSize:11,padding:"3px 10px",borderRadius:6,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontWeight:600,transition:"all 0.15s"}}>
        ● {showDone?"Hide Done":"Show Done"}
      </button>
      <button onClick={()=>setStrategicMode(v=>!v)} style={{background:strategicMode?`${BRAND_BLUE}30`:"rgba(255,255,255,0.08)",border:`1px solid ${strategicMode?BRAND_BLUE+"80":"rgba(255,255,255,0.15)"}`,color:strategicMode?"#60A5FA":"rgba(255,255,255,0.4)",fontSize:11,padding:"3px 10px",borderRadius:6,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontWeight:600,transition:"all 0.15s"}}>
        <span style={{fontSize:9}}>◆</span>{strategicMode?"Planned Project Items":"Operational Items"}
      </button>
      <div style={{flex:1}}/>
      <SaveStatus status={saveStatus}/>
      <div style={{display:"flex",gap:6,alignItems:"center",marginRight:12}}>
        <Pill label="Active"  value={jiraTasks}   color="#60A5FA"/>
        <Pill label="Done"    value={doneTasks}    color="#4ADE80"/>
        <Pill label="Planned" value={manualTasks}  color="#A78BFA"/>
      </div>
      <button onClick={syncFromJira} disabled={syncing} style={{background:syncing?"rgba(255,255,255,0.08)":BRAND_BLUE,border:`1px solid ${syncing?"rgba(255,255,255,0.15)":"#1D6FE8"}`,color:"white",padding:"6px 14px",borderRadius:7,fontSize:11,fontWeight:600,cursor:syncing?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:6,opacity:syncing?0.7:1}}>
        <span style={{display:"inline-block",animation:syncing?"spin 1s linear infinite":"none"}}>⟳</span>
        {syncing?"Syncing…":"Sync WOPS"}
      </button>
      <button onClick={()=>openAddMilestone(TODAY_KEY)} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(217,119,6,0.5)",color:"#FCD34D",padding:"6px 12px",borderRadius:7,fontSize:11,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>🚩 Milestone</button>
      <button onClick={()=>openAdd(1,TODAY_KEY)} style={{background:DONE_COLOR,border:"none",color:"white",padding:"6px 14px",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
        <span style={{fontSize:15,lineHeight:1}}>+</span> Add
      </button>
    </div>
  );

  const TopBarMobile = (
    <div style={{background:BRAND_NAVY,padding:"10px 14px 8px",flexShrink:0,borderRadius:"14px 14px 0 0"}}>
      {/* row 1: logo + date + sync */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 3h3v6h8V3h3v14h-3v-5H6v5H3V3z" fill={BRAND_BLUE}/></svg>
        <span style={{fontSize:12,fontWeight:800,color:"#FFF"}}>HMP</span>
        <span style={{fontSize:11,fontWeight:400,color:"rgba(255,255,255,0.5)"}}>Team Planner</span>
        <div style={{flex:1}}/>
        <SaveStatus status={saveStatus}/>
        <button onClick={syncFromJira} disabled={syncing} style={{background:syncing?"rgba(255,255,255,0.08)":BRAND_BLUE,border:"none",color:"white",padding:"5px 10px",borderRadius:6,fontSize:10,fontWeight:600,cursor:syncing?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:4,opacity:syncing?0.7:1}}>
          <span style={{display:"inline-block",animation:syncing?"spin 1s linear infinite":"none",fontSize:12}}>⟳</span>
          {syncing?"…":"Sync"}
        </button>
      </div>
      {/* row 2: date nav + toggles */}
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:2,background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:7,padding:"2px 4px"}}>
          <button onClick={()=>setMonthOffset(o=>o-1)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:14,padding:"1px 4px",lineHeight:1}}>‹</button>
          <span style={{fontSize:11,fontWeight:600,color:"#FFF",minWidth:130,textAlign:"center"}}>{monthLabel}</span>
          <button onClick={()=>setMonthOffset(o=>o+1)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:14,padding:"1px 4px",lineHeight:1}}>›</button>
        </div>
        {monthOffset!==0&&<button onClick={()=>setMonthOffset(0)} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.15)",color:"rgba(255,255,255,0.7)",fontSize:10,padding:"3px 8px",borderRadius:5,cursor:"pointer"}}>Today</button>}
        <button onClick={()=>setShowDone(v=>!v)} style={{background:showDone?`${DONE_COLOR}25`:"rgba(255,255,255,0.08)",border:`1px solid ${showDone?DONE_COLOR+"60":"rgba(255,255,255,0.15)"}`,color:showDone?"#4ADE80":"rgba(255,255,255,0.4)",fontSize:10,padding:"3px 9px",borderRadius:5,cursor:"pointer",fontWeight:600}}>
          {showDone?"Hide Done":"Show Done"}
        </button>
        <button onClick={()=>setStrategicMode(v=>!v)} style={{background:strategicMode?`${BRAND_BLUE}35`:"rgba(255,255,255,0.08)",border:`1px solid ${strategicMode?BRAND_BLUE+"90":"rgba(255,255,255,0.15)"}`,color:strategicMode?"#60A5FA":"rgba(255,255,255,0.4)",fontSize:10,padding:"3px 9px",borderRadius:5,cursor:"pointer",fontWeight:600}}>
          ◆ {strategicMode?"Planned":"Operational"}
        </button>
        {/* mini stats */}
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#60A5FA"}}>{jiraTasks}<span style={{fontSize:9,fontWeight:400,color:"rgba(255,255,255,0.4)",marginLeft:2}}>active</span></span>
          <span style={{fontSize:11,fontWeight:700,color:"#A78BFA"}}>{manualTasks}<span style={{fontSize:9,fontWeight:400,color:"rgba(255,255,255,0.4)",marginLeft:2}}>planned</span></span>
        </div>
      </div>
    </div>
  );

  // ── STRATEGIC BANNER ──────────────────────────────────────────────────────
  const StrategicBanner = strategicMode && (
    <div style={{background:"#EFF6FF",borderBottom:"1px solid #BFDBFE",padding:"5px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
      <span style={{fontSize:10,color:BRAND_BLUE,fontWeight:700,letterSpacing:"0.07em"}}>◆ PLANNED PROJECT ITEMS</span>
      {!isMobile&&<span style={{fontSize:10,color:C.textSecond}}>— Operational Jira tickets hidden.</span>}
      <button onClick={()=>setStrategicMode(false)} style={{marginLeft:"auto",background:"none",border:"1px solid #BFDBFE",color:C.textSecond,cursor:"pointer",fontSize:10,padding:"2px 8px",borderRadius:5,fontWeight:500}}>Show Operational ✕</button>
    </div>
  );

  const SyncBanner = syncStatus && (
    <div style={{background:syncStatus.type==="success"?"#F0FDF4":"#FEF2F2",borderBottom:`1px solid ${syncStatus.type==="success"?"#BBF7D0":"#FECACA"}`,padding:"6px 16px",fontSize:12,color:syncStatus.type==="success"?"#16A34A":"#DC2626",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
      <span>{syncStatus.message}</span>
      <button onClick={()=>setSyncStatus(null)} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:14}}>✕</button>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // MOBILE LAYOUT
  // ─────────────────────────────────────────────────────────────────────────
  const MobileContent = (
    <div style={{fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",background:C.pageBg,height:"100svh",display:"flex",flexDirection:"column",boxSizing:"border-box",padding:"10px"}}>
      <div style={{background:C.surface,borderRadius:14,boxShadow:"0 2px 6px rgba(0,0,0,0.06),0 8px 32px rgba(0,0,0,0.09)",flex:1,display:"flex",flexDirection:"column",overflow:"hidden",border:`1px solid ${C.border}`}}>
        {TopBarMobile}
        {StrategicBanner}
        {SyncBanner}

        {loading ? (
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.textMuted,fontSize:13,gap:8}}>
            <span style={{display:"inline-block",animation:"spin 1s linear infinite",color:BRAND_BLUE}}>⟳</span> Loading…
          </div>
        ) : (
          <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
            {/* milestone strip */}
            <MobileMilestoneStrip
              milestones={milestones}
              monthLabel={monthLabel}
              onAdd={openAddMilestone}
              onEdit={openEditMilestone}
            />

            {/* team member sections */}
            {TEAM_MEMBERS.map(member=>{
              const allTasks = assignments.filter(a=>a.memberId===member.id);
              const filtered  = allTasks.filter(a=>showDone?true:!a.isDone);
              const tasks     = strategicMode ? filtered.filter(a=>!a.fromJira) : filtered;
              const jiraCount = allTasks.filter(a=>a.fromJira&&!a.isDone).length;
              const isExp     = expanded[member.id];

              // sort: planned items first, then by due date
              const sorted=[...tasks].sort((a,b)=>{
                if(!a.fromJira&&b.fromJira) return -1;
                if(a.fromJira&&!b.fromJira) return 1;
                return 0;
              });

              return(
                <div key={member.id} style={{borderBottom:`2px solid ${C.border}`}}>
                  {/* member header */}
                  <div
                    onClick={()=>setExpanded(p=>({...p,[member.id]:!p[member.id]}))}
                    style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",background:C.surfaceHdr,borderLeft:`4px solid ${member.color}`,cursor:"pointer",position:"sticky",top:0,zIndex:5}}
                  >
                    <div style={{width:34,height:34,borderRadius:9,background:`${member.color}18`,border:`1.5px solid ${member.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:member.color,flexShrink:0}}>{member.initials}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:BRAND_NAVY}}>{member.name}</div>
                      <div style={{fontSize:10,color:C.textMuted,marginTop:1}}>
                        {tasks.length} task{tasks.length!==1?"s":""}
                        {strategicMode&&jiraCount>0&&<span style={{color:C.textDisabled,marginLeft:4}}>· {jiraCount} Jira hidden</span>}
                      </div>
                    </div>
                    <span style={{fontSize:18,color:C.textMuted,transition:"transform 0.2s",transform:isExp?"rotate(90deg)":"none"}}>›</span>
                  </div>

                  {/* tasks */}
                  {isExp&&(
                    sorted.length===0 ? (
                      <div style={{padding:"12px 14px",fontSize:11,color:C.textMuted,fontStyle:"italic",background:C.surface}}>
                        {strategicMode?"No planned project items — tap + Add below":"No tasks"}
                      </div>
                    ) : (
                      sorted.map(a=>(
                        <MobileTaskCard key={a.id} a={a} member={member} onEdit={openEdit}/>
                      ))
                    )
                  )}
                </div>
              );
            })}
            {/* bottom padding so FABs don't cover last item */}
            <div style={{height:80}}/>
          </div>
        )}
      </div>

      {/* FABs */}
      <div style={{position:"fixed",bottom:24,right:20,display:"flex",flexDirection:"column",gap:10,zIndex:50}}>
        <button onClick={()=>openAddMilestone(TODAY_KEY)} style={{width:46,height:46,borderRadius:"50%",background:BRAND_NAVY,border:"2px solid rgba(217,119,6,0.6)",color:"#FCD34D",fontSize:18,cursor:"pointer",boxShadow:"0 4px 16px rgba(0,0,0,0.2)",display:"flex",alignItems:"center",justifyContent:"center"}}>🚩</button>
        <button onClick={()=>openAdd(1,TODAY_KEY)} style={{width:52,height:52,borderRadius:"50%",background:DONE_COLOR,border:"none",color:"white",fontSize:24,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(22,163,74,0.4)",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>+</button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DESKTOP LAYOUT
  // ─────────────────────────────────────────────────────────────────────────
  const DesktopContent = (
    <div style={{fontFamily:"'Inter','Segoe UI',system-ui,sans-serif",background:C.pageBg,height:"100vh",padding:"14px",display:"flex",flexDirection:"column",boxSizing:"border-box"}}>
      <div style={{background:C.surface,borderRadius:14,boxShadow:"0 2px 6px rgba(0,0,0,0.06),0 8px 32px rgba(0,0,0,0.09)",flex:1,display:"flex",flexDirection:"column",overflow:"hidden",border:`1px solid ${C.border}`}}>
        {TopBarDesktop}
        {StrategicBanner}
        {SyncBanner}

        {loading?(
          <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:C.textMuted,fontSize:13,gap:8}}>
            <span style={{display:"inline-block",animation:"spin 1s linear infinite",color:BRAND_BLUE}}>⟳</span> Loading…
          </div>
        ):(
          <div ref={gridRef} style={{flex:1,overflow:"auto"}}>
            {colW>0&&(
              <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
                <colgroup>
                  <col style={{width:SIDEBAR_W}}/>
                  {DAYS.map((_,i)=><col key={i} style={{width:colW}}/>)}
                </colgroup>
                <thead>
                  <tr style={{background:C.surfaceHdr}}>
                    <th style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,padding:"5px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:C.textMuted,letterSpacing:"0.07em",position:"sticky",top:0,zIndex:20,background:C.surfaceHdr}}>TEAM</th>
                    {monthGroups.map(g=><th key={g.key} colSpan={g.count} style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,padding:"5px 10px",textAlign:"left",fontSize:10,fontWeight:700,color:BRAND_NAVY,letterSpacing:"0.05em",position:"sticky",top:0,zIndex:19,background:C.surfaceHdr}}>{g.label.toUpperCase()}</th>)}
                  </tr>
                  <tr>
                    <th style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,position:"sticky",top:27,zIndex:20,background:C.surfaceHdr}}/>
                    {weekGroups.map(g=><th key={g.key} colSpan={g.count} style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,padding:"3px 5px",textAlign:"left",fontSize:9,fontWeight:600,color:C.textMuted,background:C.surfaceHdr,position:"sticky",top:27,zIndex:19}}>{g.label}</th>)}
                  </tr>
                  <tr>
                    <th style={{borderBottom:`2px solid ${C.borderMid}`,borderRight:`1px solid ${C.border}`,position:"sticky",top:50,zIndex:20,background:C.surface}}/>
                    {DAYS.map((d,i)=>{
                      const isToday=dateKey(d)===TODAY_KEY;
                      const msOnDay=milestones.filter(m=>m.startKey===dateKey(d));
                      return(
                        <th key={i} style={{borderBottom:`2px solid ${C.borderMid}`,borderRight:`1px solid ${C.border}`,padding:"2px 0",textAlign:"center",fontSize:9,color:isToday?BRAND_BLUE:C.textMuted,fontWeight:isToday?800:400,background:msOnDay.length>0?`${msOnDay[0].jiraKey}18`:isToday?C.todayBg:C.surface,position:"sticky",top:50,zIndex:19}}>
                          {isToday?"•":d.getDate()}
                          {msOnDay.length>0&&<div style={{fontSize:7,color:msOnDay[0].jiraKey,marginTop:1}}>◆</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* milestones row */}
                  <tr key="milestones-row">
                    <td style={{borderBottom:`2px solid ${C.borderMid}`,borderRight:`1px solid ${C.border}`,padding:"0 10px 0 14px",height:44,position:"sticky",left:0,zIndex:10,background:"#FFFBEB"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:10}}>🚩</span>
                          <span style={{fontSize:9,fontWeight:700,color:"#92400E",letterSpacing:"0.07em"}}>MILESTONES</span>
                        </div>
                        <button onClick={()=>openAddMilestone(TODAY_KEY)} style={{background:"none",border:"1px solid #D97706",color:"#D97706",fontSize:9,padding:"2px 6px",borderRadius:4,cursor:"pointer",fontWeight:700}}>+</button>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:"3px 6px"}}>
                        {MILESTONE_COLORS.map(c=>(
                          <div key={c} style={{display:"flex",alignItems:"center",gap:3}}>
                            <span style={{width:7,height:7,borderRadius:"50%",background:c,display:"inline-block",flexShrink:0}}/>
                            <span style={{fontSize:8,color:"#92400E",opacity:0.75,whiteSpace:"nowrap"}}>{MILESTONE_LEGEND[c]}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    {DAYS.map((d,i)=>{
                      const dk=dayKeys[i];
                      const isToday=dk===TODAY_KEY;
                      const msOnDay=milestones.filter(m=>m.startKey===dk);
                      return(
                        <td key={i} style={{borderBottom:`2px solid ${C.borderMid}`,borderRight:`1px solid ${C.border}`,background:msOnDay.length>0?`${msOnDay[0].jiraKey}12`:"#FFFBEB",padding:"3px 1px",cursor:msOnDay.length===0?"crosshair":"default",verticalAlign:"middle"}}
                          onClick={()=>msOnDay.length===0&&openAddMilestone(dk)}>
                          {msOnDay.length>0&&(()=>{
                            const ms=msOnDay[0];
                            const extra=msOnDay.length-1;
                            return(
                              <div style={{display:"flex",flexDirection:"column",gap:2,padding:"2px 1px"}}>
                                <div onClick={e=>openEditMilestone(e,ms)}
                                  onMouseEnter={e=>setTooltip({id:ms.id,x:e.clientX,y:e.clientY,a:{title:ms.title,startKey:ms.startKey,status:"Milestone",fromJira:false}})}
                                  onMouseLeave={()=>setTooltip(null)}
                                  style={{height:30,borderRadius:5,background:`linear-gradient(135deg,${ms.jiraKey}22,${ms.jiraKey}10)`,border:`1.5px solid ${ms.jiraKey}`,display:"flex",alignItems:"center",padding:"0 5px",gap:3,cursor:"pointer",boxShadow:`0 1px 4px ${ms.jiraKey}33`}}>
                                  <span style={{fontSize:9}}>🚩</span>
                                  <span style={{fontSize:8,fontWeight:800,color:ms.jiraKey,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{ms.title}</span>
                                </div>
                                {extra>0&&(
                                  <div onClick={e=>{e.stopPropagation();openEditMilestone(e,msOnDay[1]);}}
                                    style={{fontSize:8,fontWeight:700,color:msOnDay[1].jiraKey,background:`${msOnDay[1].jiraKey}15`,border:`1px solid ${msOnDay[1].jiraKey}40`,borderRadius:4,padding:"1px 5px",textAlign:"center",cursor:"pointer"}}>
                                    +{extra} more
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                      );
                    })}
                  </tr>

                  {/* team members */}
                  {TEAM_MEMBERS.map(member=>{
                    const allTasks=assignments.filter(a=>a.memberId===member.id);
                    const filtered=allTasks.filter(a=>showDone?true:!a.isDone);
                    const mTasks=strategicMode?filtered.filter(a=>!a.fromJira):filtered;
                    const isExpanded=expanded[member.id];
                    const jiraActiveCount=allTasks.filter(a=>a.fromJira&&!a.isDone).length;
                    const visibleDays=allTasks.filter(a=>a.startKey&&a.endKey).reduce((s,a)=>{
                      const bar=getBarSpan(a.startKey,a.endKey,dayKeys);
                      return s+(bar?bar.span:0);
                    },0);
                    const pct=Math.min(100,Math.round((visibleDays/NUM_DAYS)*100));
                    const barColor=pct>80?"#DC2626":pct>60?"#D97706":member.color;

                    return[
                      <tr key={`hdr-${member.id}`} style={{cursor:"pointer",background:C.surfaceHdr}} onClick={()=>setExpanded(p=>({...p,[member.id]:!p[member.id]}))}>
                        <td style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,borderLeft:`3px solid ${member.color}`,padding:"0 10px",height:46,position:"sticky",left:0,zIndex:10,background:C.surfaceHdr}}>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:9,color:C.textMuted,userSelect:"none",width:10}}>{isExpanded?"▾":"▸"}</span>
                            <div style={{width:28,height:28,borderRadius:8,background:`${member.color}18`,border:`1.5px solid ${member.color}50`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:member.color,flexShrink:0}}>{member.initials}</div>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{fontSize:12,fontWeight:700,color:BRAND_NAVY,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{member.name}</div>
                              <div style={{fontSize:9,color:C.textMuted,marginTop:1}}>
                                {mTasks.length} task{mTasks.length!==1?"s":""}
                                {strategicMode&&jiraActiveCount>0&&<span style={{color:C.textDisabled,marginLeft:4}}>· {jiraActiveCount} Jira hidden</span>}
                              </div>
                            </div>
                            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:3}}>
                              <span style={{fontSize:9,fontWeight:700,color:barColor}}>{pct}%</span>
                              <div style={{width:38,height:3,background:C.border,borderRadius:2}}>
                                <div style={{height:"100%",width:`${pct}%`,background:barColor,borderRadius:2}}/>
                              </div>
                            </div>
                          </div>
                        </td>
                        {DAYS.map((d,i)=><td key={i} style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,background:dateKey(d)===TODAY_KEY?C.todayBg:C.surfaceHdr}}/>)}
                      </tr>,

                      isExpanded&&mTasks.length===0&&(
                        <tr key={`empty-${member.id}`}>
                          <td style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,borderLeft:`3px solid ${member.color}20`,padding:"0 14px 0 26px",height:32,position:"sticky",left:0,zIndex:10,background:C.surface}}>
                            <span style={{fontSize:10,color:C.textMuted,fontStyle:"italic"}}>{strategicMode?"No planned project items — click timeline to add":"No tasks"}</span>
                          </td>
                          {DAYS.map((d,i)=><td key={i} style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,background:dateKey(d)===TODAY_KEY?C.todayBg:C.surface,cursor:"crosshair"}} onClick={()=>openAdd(member.id,dateKey(d))}/>)}
                        </tr>
                      ),

                      isExpanded&&mTasks.map(a=>{
                        const isManual=!a.fromJira;
                        const bar=a.startKey&&a.endKey?getBarSpan(a.startKey,a.endKey,dayKeys):null;
                        const dueIdx=a.dueDateKey?dayKeys.findIndex(k=>k===a.dueDateKey):-1;
                        const resolvedIdx=a.resolvedKey?dayKeys.findIndex(k=>k===a.resolvedKey):-1;
                        const rowH=isManual?36:26;
                        const cells=[]; let i=0;
                        while(i<NUM_DAYS){
                          const dk=dayKeys[i];
                          const isToday=dk===TODAY_KEY;
                          const isBarStart=bar&&bar.sIdx===i;
                          const isDueDay=!a.isDone&&a.fromJira&&dueIdx===i;
                          const isOverdue=isDueDay&&a.dueDateKey<TODAY_KEY;
                          const isDoneDay=a.isDone&&resolvedIdx===i;
                          if(isBarStart){
                            if(isManual){
                              cells.push(<td key={i} colSpan={bar.span} style={{borderBottom:`1px solid ${C.border}`,borderRight:"none",background:isToday?C.todayBg:C.surface,padding:"4px 2px",cursor:"pointer"}} onClick={e=>openEdit(e,a)}>
                                <div onMouseEnter={e=>setTooltip({id:a.id,x:e.clientX,y:e.clientY,a})} onMouseLeave={()=>setTooltip(null)}
                                  style={{height:26,borderRadius:5,background:`linear-gradient(135deg,${member.color},${member.color}CC)`,borderLeft:`4px solid ${member.color}DD`,display:"flex",alignItems:"center",padding:"0 8px",gap:5,boxShadow:`0 2px 8px ${member.color}40`,overflow:"hidden",cursor:"pointer"}}>
                                  <span style={{fontSize:9,color:"rgba(255,255,255,0.8)",flexShrink:0}}>◆</span>
                                  <span style={{fontSize:11,fontWeight:700,color:"white",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textShadow:"0 1px 2px rgba(0,0,0,0.3)"}}>{a.title}</span>
                                </div>
                              </td>);
                            }else{
                              cells.push(<td key={i} colSpan={bar.span} style={{borderBottom:`1px solid ${C.border}`,borderRight:"none",background:isToday?C.todayBg:C.surface,padding:"3px 2px",cursor:"pointer"}} onClick={e=>openEdit(e,a)}>
                                <div onMouseEnter={e=>setTooltip({id:a.id,x:e.clientX,y:e.clientY,a})} onMouseLeave={()=>setTooltip(null)}
                                  style={{height:20,borderRadius:4,background:`${member.color}18`,borderLeft:`2px solid ${member.color}60`,display:"flex",alignItems:"center",padding:"0 6px",overflow:"hidden"}}>
                                  <span style={{fontSize:9,fontWeight:500,color:member.color,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.title}</span>
                                </div>
                              </td>);
                            }
                            i+=bar.span;
                          }else if(isDueDay){
                            cells.push(<td key={i} style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,background:isToday?C.todayBg:C.surface,padding:"3px 2px",cursor:"pointer"}} onClick={e=>openEdit(e,a)}>
                              <div onMouseEnter={e=>setTooltip({id:a.id,x:e.clientX,y:e.clientY,a})} onMouseLeave={()=>setTooltip(null)}
                                style={{height:20,borderRadius:4,background:isOverdue?"#FEF2F2":`${member.color}10`,border:`1px dashed ${isOverdue?"#DC2626":member.color}70`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                <span style={{fontSize:8,fontWeight:800,color:isOverdue?"#DC2626":member.color}}>DUE</span>
                              </div>
                            </td>);
                            i++;
                          }else if(isDoneDay){
                            cells.push(<td key={i} style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,background:isToday?C.todayBg:C.surface,padding:"3px 2px",cursor:"pointer"}} onClick={e=>openEdit(e,a)}>
                              <div onMouseEnter={e=>setTooltip({id:a.id,x:e.clientX,y:e.clientY,a})} onMouseLeave={()=>setTooltip(null)}
                                style={{height:20,borderRadius:4,background:"#F0FDF4",border:`1px dashed ${DONE_COLOR}60`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                                <span style={{fontSize:8,fontWeight:800,color:DONE_COLOR}}>DONE</span>
                              </div>
                            </td>);
                            i++;
                          }else{
                            if(bar&&i>bar.sIdx&&i<bar.sIdx+bar.span){i++;continue;}
                            cells.push(<td key={i} style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,background:isToday?C.todayBg:C.surface,cursor:"crosshair"}} onClick={()=>openAdd(member.id,dk)}/>);
                            i++;
                          }
                        }
                        return(
                          <tr key={`task-${a.id}`}>
                            <td style={{borderBottom:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,borderLeft:isManual?`3px solid ${member.color}`:`3px solid ${member.color}20`,padding:isManual?"0 10px 0 18px":"0 10px 0 22px",height:rowH,position:"sticky",left:0,zIndex:10,background:isManual?`${member.color}06`:C.surface,cursor:"pointer"}} onClick={e=>openEdit(e,a)}>
                              <div style={{display:"flex",alignItems:"center",gap:5}}>
                                {isManual?(
                                  <span style={{fontSize:8,fontWeight:700,background:`${member.color}18`,color:member.color,padding:"1px 4px",borderRadius:3,flexShrink:0,border:`1px solid ${member.color}30`}}>◆</span>
                                ):(
                                  <span style={{fontSize:8,fontWeight:600,background:a.isDone?"#F0FDF4":a.dueDateKey<TODAY_KEY?"#FEF2F2":"#EFF6FF",color:a.isDone?DONE_COLOR:a.dueDateKey<TODAY_KEY?"#DC2626":"#2563EB",padding:"1px 3px",borderRadius:3,flexShrink:0}}>{a.isDone?"✓":"J"}</span>
                                )}
                                <span style={{fontSize:isManual?11:9,fontWeight:isManual?600:400,color:isManual?(a.isDone?C.textMuted:BRAND_NAVY):(a.isDone?C.textDisabled:a.dueDateKey<TODAY_KEY?"#DC2626":C.textMuted),whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:140,textDecoration:a.isDone?"line-through":"none"}}>{a.title}</span>
                              </div>
                            </td>
                            {cells}
                          </tr>
                        );
                      })
                    ];
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* desktop tooltip */}
      {tooltip&&(
        <div style={{position:"fixed",left:tooltip.x+14,top:tooltip.y-80,background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"10px 14px",fontSize:12,pointerEvents:"none",zIndex:1000,boxShadow:"0 8px 32px rgba(0,0,0,0.15)",minWidth:180}}>
          <div style={{fontWeight:700,color:BRAND_NAVY,marginBottom:4}}>{tooltip.a.title}</div>
          {tooltip.a.memberId&&<div style={{color:C.textSecond,fontSize:11}}>{TEAM_MEMBERS.find(m=>m.id===tooltip.a.memberId)?.name}</div>}
          {tooltip.a.status==="Milestone"&&<div style={{color:"#D97706",fontSize:10,marginTop:2}}>📍 Milestone</div>}
          {tooltip.a.startKey&&tooltip.a.status!=="Milestone"&&<div style={{color:C.textMuted,fontSize:10,marginTop:3}}>{fmtDate(tooltip.a.startKey)} → {fmtDate(tooltip.a.endKey)}</div>}
          {tooltip.a.startKey&&tooltip.a.status==="Milestone"&&<div style={{color:C.textMuted,fontSize:10,marginTop:3}}>{fmtDateLong(tooltip.a.startKey)}</div>}
          {tooltip.a.dueDateKey&&!tooltip.a.isDone&&<div style={{color:"#D97706",fontSize:10,marginTop:3}}>Due {fmtDate(tooltip.a.dueDateKey)}</div>}
          {tooltip.a.resolvedKey&&tooltip.a.isDone&&<div style={{color:DONE_COLOR,fontSize:10,marginTop:3}}>Resolved {fmtDate(tooltip.a.resolvedKey)}</div>}
          {tooltip.a.status&&tooltip.a.status!=="Milestone"&&<div style={{color:C.textMuted,fontSize:10,marginTop:2}}>Status: {tooltip.a.status}</div>}
          {tooltip.a.fromJira&&tooltip.a.jiraKey&&<div style={{color:BRAND_BLUE,fontSize:10,marginTop:3}}>↗ {tooltip.a.jiraKey} · click to open</div>}
        </div>
      )}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SHARED MODALS
  // ─────────────────────────────────────────────────────────────────────────
  const modalOverlay = { position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",zIndex:200,backdropFilter:"blur(4px)" };
  const modalCard    = { background:C.surface,border:`1px solid ${C.border}`,borderRadius:isMobile?"14px 14px 0 0":"14px",padding:isMobile?"20px 20px 32px":"26px",width:isMobile?"100%":"420px",boxShadow:"0 24px 60px rgba(0,0,0,0.2)",boxSizing:"border-box",maxHeight:isMobile?"95svh":"auto",overflowY:"auto" };

  const AssignmentModal = showModal&&(
    <div onClick={e=>e.target===e.currentTarget&&setShowModal(false)} style={modalOverlay}>
      <div style={modalCard}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <h2 style={{margin:0,fontSize:16,fontWeight:700,color:BRAND_NAVY}}>
              {editItem?"Edit Planned Project Item":form.title.endsWith(" (copy)")?"Clone Planned Project Item":"New Planned Project Item"}
            </h2>
            {!editItem&&<p style={{margin:"4px 0 0",fontSize:11,color:C.textMuted}}>
              {form.title.endsWith(" (copy)")?"Edit the details below, then save to create a duplicate.":"Appears as a prominent bar on the team timeline."}
            </p>}
          </div>
          <button onClick={()=>setShowModal(false)} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:22,lineHeight:1,marginTop:-2,padding:"0 4px"}}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label style={labelStyle}>Title</label>
            <input value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Homepage Redesign Q2" autoFocus style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Assign To</label>
            <select value={form.memberId} onChange={e=>setForm(f=>({...f,memberId:Number(e.target.value)}))} style={{...inputStyle,cursor:"pointer"}}>
              {TEAM_MEMBERS.map(m=><option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
            </select>
          </div>
          {!form.fromJira&&(
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}>
                <label style={labelStyle}>Start Date</label>
                <input type="date" value={form.startKey} onChange={e=>setForm(f=>({...f,startKey:e.target.value}))} style={{...inputStyle,cursor:"pointer",colorScheme:"light"}}/>
              </div>
              <div style={{flex:1}}>
                <label style={labelStyle}>End Date</label>
                <input type="date" value={form.endKey} min={form.startKey} onChange={e=>setForm(f=>({...f,endKey:e.target.value}))} style={{...inputStyle,cursor:"pointer",colorScheme:"light"}}/>
              </div>
            </div>
          )}
          {form.endKey<form.startKey&&<div style={{fontSize:11,color:"#DC2626"}}>End date must be after start date.</div>}
          <div style={{display:"flex",gap:8,marginTop:4}}>
            {editItem&&<button onClick={()=>del(editItem.id)} style={{flex:1,background:"#FEF2F2",border:"1px solid #FECACA",color:"#DC2626",padding:10,borderRadius:8,fontSize:13,cursor:"pointer",fontWeight:600}}>Delete</button>}
            {editItem&&!editItem.fromJira&&(
              <button onClick={cloneItem} title="Duplicate this item" style={{flex:1,background:C.surfaceAlt,border:`1px solid ${C.border}`,color:C.textSecond,padding:10,borderRadius:8,fontSize:13,cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
                <span style={{fontSize:14}}>⧉</span> Clone
              </button>
            )}
            <button onClick={save} disabled={!form.fromJira&&form.endKey<form.startKey} style={{flex:2,background:BRAND_NAVY,border:"none",color:"white",padding:10,borderRadius:8,fontSize:14,cursor:"pointer",fontWeight:700}}>
              {editItem?"Save Changes":"Add Planned Project Item"}
            </button>
          </div>
          {editItem?.fromJira&&editItem?.jiraKey&&(
            <a href={`${JIRA_BASE}/${editItem.jiraKey}`} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:4,color:BRAND_BLUE,fontSize:13,textDecoration:"none",padding:9,borderRadius:8,border:`1px solid ${C.border}`,background:C.surfaceAlt}}>
              ↗ View {editItem.jiraKey} in Jira
            </a>
          )}
        </div>
      </div>
    </div>
  );

  const MilestoneModal = showMilestoneModal&&(
    <div onClick={e=>e.target===e.currentTarget&&setShowMilestoneModal(false)} style={modalOverlay}>
      <div style={{...modalCard,border:`1px solid ${milestoneForm.color}40`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
          <div>
            <h2 style={{margin:0,fontSize:16,fontWeight:700,color:BRAND_NAVY,display:"flex",alignItems:"center",gap:8}}>🚩 {editMilestone?"Edit Milestone":"New Milestone"}</h2>
            <p style={{margin:"4px 0 0",fontSize:11,color:C.textMuted}}>Marks a key project date across the full team timeline.</p>
          </div>
          <button onClick={()=>setShowMilestoneModal(false)} style={{background:"none",border:"none",color:C.textMuted,cursor:"pointer",fontSize:22,lineHeight:1,marginTop:-2,padding:"0 4px"}}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label style={labelStyle}>Milestone Name</label>
            <input value={milestoneForm.title} onChange={e=>setMilestoneForm(f=>({...f,title:e.target.value}))} placeholder="e.g. Phase 1 Complete, Q2 Launch" autoFocus style={{...inputStyle,borderColor:milestoneForm.color+"50"}}/>
          </div>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={milestoneForm.dateKey} onChange={e=>setMilestoneForm(f=>({...f,dateKey:e.target.value}))} style={{...inputStyle,borderColor:milestoneForm.color+"50",cursor:"pointer",colorScheme:"light"}}/>
          </div>
          <div>
            <label style={labelStyle}>Color / Category</label>
            <div style={{display:"flex",gap:8,marginTop:8,flexWrap:"wrap"}}>
              {MILESTONE_COLORS.map(c=>(
                <div key={c} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,cursor:"pointer"}} onClick={()=>setMilestoneForm(f=>({...f,color:c}))}>
                  <div style={{width:32,height:32,borderRadius:8,background:c,border:milestoneForm.color===c?`3px solid ${BRAND_NAVY}`:`2px solid ${c}40`,boxShadow:milestoneForm.color===c?`0 0 0 2px white,0 0 0 4px ${c}`:"none",transition:"all 0.15s"}}/>
                  <span style={{fontSize:8,color:milestoneForm.color===c?c:C.textMuted,fontWeight:milestoneForm.color===c?700:400,whiteSpace:"nowrap",transition:"all 0.15s"}}>{MILESTONE_LEGEND[c]}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{background:C.surfaceAlt,borderRadius:7,padding:"10px 12px",border:`1px solid ${C.border}`}}>
            <div style={{fontSize:9,color:C.textMuted,marginBottom:6,fontWeight:600,letterSpacing:"0.06em"}}>PREVIEW</div>
            <div style={{height:36,borderRadius:5,background:`${milestoneForm.color}15`,border:`1.5px solid ${milestoneForm.color}`,display:"flex",alignItems:"center",padding:"0 8px",gap:5,boxShadow:`0 1px 4px ${milestoneForm.color}30`}}>
              <span style={{fontSize:12}}>🚩</span>
              <span style={{fontSize:11,fontWeight:800,color:milestoneForm.color}}>{milestoneForm.title||"Milestone name…"}</span>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            {editMilestone&&<button onClick={()=>delMilestone(editMilestone.id)} style={{flex:1,background:"#FEF2F2",border:"1px solid #FECACA",color:"#DC2626",padding:10,borderRadius:8,fontSize:13,cursor:"pointer",fontWeight:600}}>Delete</button>}
            <button onClick={saveMilestone} disabled={!milestoneForm.title.trim()} style={{flex:2,background:milestoneForm.color,border:"none",color:"white",padding:10,borderRadius:8,fontSize:14,cursor:milestoneForm.title.trim()?"pointer":"not-allowed",fontWeight:700,opacity:milestoneForm.title.trim()?1:0.5}}>
              {editMilestone?"Save Milestone":"Add Milestone"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {isMobile ? MobileContent : DesktopContent}
      {AssignmentModal}
      {MilestoneModal}
      <style>{`
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:${C.pageBg}}
        ::-webkit-scrollbar-thumb{background:${C.borderMid};border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:#94A3B8}
        tbody tr:hover>td{background:#F8FAFC!important}
        input[type="date"]::-webkit-calendar-picker-indicator{opacity:0.5;cursor:pointer}
      `}</style>
    </>
  );
}
