import { useState, useRef, useEffect, useCallback } from "react";

const TEAM_MEMBERS = [
  { id: 1, name: "Ryan Geraghty", role: "Director, Software Development", color: "#6366F1", initials: "RG" },
  { id: 2, name: "Michael Santilli", role: "Sr. Web Developer", color: "#3B82F6", initials: "MS" },
  { id: 3, name: "John Kaeser", role: "Sr. Developer", color: "#10B981", initials: "JK" },
  { id: 4, name: "Jason Moore", role: "Web Developer", color: "#F59E0B", initials: "JM" },
];

const JIRA_BASE = "https://hmpglobal.atlassian.net/browse";
const SIDEBAR_W = 200;
const TODAY = new Date(); TODAY.setHours(0,0,0,0);
const TODAY_KEY = TODAY.toISOString().slice(0,10);
const DONE_COLOR = "#22C55E";

function dateKey(d) { return new Date(d).toISOString().slice(0,10); }
function isWeekend(d) { const day = new Date(d).getDay(); return day === 0 || day === 6; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function buildDays(monthOffset, numMonths) {
  const days = [];
  const base = new Date(TODAY.getFullYear(), TODAY.getMonth() + monthOffset, 1);
  for (let m = 0; m < numMonths; m++) {
    const month = new Date(base.getFullYear(), base.getMonth() + m, 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(month.getFullYear(), month.getMonth(), d);
      if (!isWeekend(date)) days.push(date);
    }
  }
  return days;
}

function getMonthGroups(days) {
  const groups = []; let cur = null;
  days.forEach((d, i) => {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleString("default", { month: "long", year: "numeric" });
    if (!cur || cur.key !== key) { cur = { key, label, start: i, count: 1 }; groups.push(cur); }
    else cur.count++;
  });
  return groups;
}

function getWeekGroups(days) {
  const groups = []; let cur = null;
  days.forEach((d, i) => {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    const key = `${d.getFullYear()}-${wk}`;
    if (!cur || cur.key !== key) { cur = { key, label: d.toLocaleDateString("default", { month: "short", day: "numeric" }), start: i, count: 1 }; groups.push(cur); }
    else cur.count++;
  });
  return groups;
}

function getBarSpan(startKey, endKey, dayKeys) {
  const sIdx = dayKeys.findIndex(k => k >= startKey);
  let eIdx = -1;
  for (let i = dayKeys.length - 1; i >= 0; i--) { if (dayKeys[i] <= endKey) { eIdx = i; break; } }
  if (sIdx === -1 || eIdx === -1 || eIdx < sIdx) return null;
  return { sIdx, span: eIdx - sIdx + 1 };
}

function SaveStatus({ status }) {
  const styles = { saving: { color: "#8B949E" }, saved: { color: "#3FB950" }, error: { color: "#F85149" } };
  const labels = { saving: "Saving…", saved: "✓ All changes saved", error: "✕ Save failed" };
  if (!status) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, ...styles[status] }}>
      {status === "saving" && <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>⟳</span>}
      {labels[status]}
    </div>
  );
}

export default function App() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [assignments, setAssignments] = useState([]);
  const [expanded, setExpanded] = useState({ 1: true, 2: true, 3: true, 4: true });
  const [showDone, setShowDone] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ title: "", memberId: 1, startKey: TODAY_KEY, endKey: dateKey(addDays(TODAY, 4)), fromJira: false, dueDateKey: null });
  const [tooltip, setTooltip] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const gridRef = useRef(null);
  const nextId = useRef(300);
  const [colW, setColW] = useState(0);
  const saveTimer = useRef(null);

  const DAYS = buildDays(monthOffset, 2);
  const NUM_DAYS = DAYS.length;
  const monthGroups = getMonthGroups(DAYS);
  const weekGroups = getWeekGroups(DAYS);
  const dayKeys = DAYS.map(d => dateKey(d));

  useEffect(() => {
    const measure = () => {
      if (gridRef.current && gridRef.current.offsetWidth > 0)
        setColW((gridRef.current.offsetWidth - SIDEBAR_W) / NUM_DAYS);
    };
    measure();
    const t = setTimeout(measure, 100);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [monthOffset, loading]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Load saved assignments
        const res = await fetch('/api/assignments');
        const data = await res.json();
        let saved = [];
        if (Array.isArray(data)) {
          saved = data.map(r => ({
            id: r.id, title: r.title, memberId: r.member_id,
            startKey: r.start_key, endKey: r.end_key,
            fromJira: r.from_jira, jiraKey: r.jira_key,
            status: r.status, dueDateKey: r.due_date_key,
            resolvedKey: r.resolved_key, isDone: r.is_done,
          }));
        }

        // Auto-sync Jira in parallel
        const [activeRes, doneRes] = await Promise.all([
          fetch(`/api/jira?jql=${encodeURIComponent('status in ("Ready to Work","In Progress","Testing","Ready for Release","Selected for Development") AND assignee is not EMPTY ORDER BY duedate ASC')}`),
          fetch(`/api/jira?jql=${encodeURIComponent('status in ("Done","Deployed") AND assignee is not EMPTY AND resolutiondate >= -30d ORDER BY resolutiondate DESC')}`),
        ]);
        const activeData = await activeRes.json();
        const doneData = await doneRes.json();

        const mapIssue = (issue, isDone) => {
          const { summary, assignee, duedate, resolutiondate } = issue.fields;
          const member = TEAM_MEMBERS.find(m => assignee && m.name.toLowerCase().includes(assignee.displayName?.split(" ")[0].toLowerCase()));
          if (!member) return null;
          let dueDateKey = null;
          if (duedate) { const dd = new Date(duedate); dd.setHours(0,0,0,0); dueDateKey = dateKey(dd); }
          let resolvedKey = null;
          const resolvedRaw = issue.fields.transitionDate || issue.fields.resolutiondate;
          if (resolvedRaw) { const rd = new Date(resolvedRaw); rd.setHours(0,0,0,0); resolvedKey = dateKey(rd); }
          return { id: `jira-${issue.id}`, title: summary, memberId: member.id, startKey: null, endKey: null, fromJira: true, jiraKey: issue.key, status: issue.fields.status?.name, dueDateKey, resolvedKey, isDone };
        };

        const jiraItems = [
          ...(activeData.issues || []).map(i => mapIssue(i, false)),
          ...(doneData.issues || []).map(i => mapIssue(i, true)),
        ].filter(Boolean);

        // Merge: keep manual items from saved, replace all jira items with fresh ones
        const merged = [...saved.filter(a => !a.fromJira), ...jiraItems];
        setAssignments(merged);

        // Persist the merged result
        await fetch('/api/assignments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assignments: merged }),
        });
      } catch(e) { console.error("Load failed", e); }
      setLoading(false);
    };
    load();
  }, []);

  const persistAssignments = useCallback(async (list) => {
    setSaveStatus("saving");
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: list }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 2000);
    } catch { setSaveStatus("error"); }
  }, []);

  const updateAssignments = useCallback((updater) => {
    setAssignments(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => persistAssignments(next), 600);
      return next;
    });
  }, [persistAssignments]);

  const openAdd = (memberId, dk) => {
    setEditItem(null);
    setForm({ title: "", memberId, startKey: dk, endKey: dateKey(addDays(new Date(dk + "T12:00:00"), 4)), fromJira: false, dueDateKey: null });
    setShowModal(true);
  };
  const openEdit = (e, a) => {
    e.stopPropagation();
    setEditItem(a);
    setForm({ title: a.title, memberId: a.memberId, startKey: a.startKey, endKey: a.endKey, fromJira: a.fromJira, dueDateKey: a.dueDateKey ?? null });
    setShowModal(true);
  };
  const save = () => {
    if (!form.title.trim() || form.endKey < form.startKey) return;
    if (editItem) updateAssignments(p => p.map(a => a.id === editItem.id ? { ...a, ...form } : a));
    else updateAssignments(p => [...p, { id: `manual-${nextId.current++}-${Date.now()}`, ...form }]);
    setShowModal(false);
  };
  const del = id => { updateAssignments(p => p.filter(a => a.id !== id)); setShowModal(false); };

  const syncFromJira = async () => {
    setSyncing(true); setSyncStatus(null);
    try {
      // Fetch active items
      const activeJql = encodeURIComponent('status in ("Ready to Work","In Progress","Testing","Ready for Release","Selected for Development") AND assignee is not EMPTY ORDER BY duedate ASC');
      // Fetch done/deployed items
      const doneJql = encodeURIComponent('status in ("Done","Deployed") AND assignee is not EMPTY AND resolutiondate >= -30d ORDER BY resolutiondate DESC');

      const [activeRes, doneRes] = await Promise.all([
        fetch(`/api/jira?jql=${activeJql}`),
        fetch(`/api/jira?jql=${doneJql}`),
      ]);

      const activeData = await activeRes.json();
      const doneData = await doneRes.json();

      const mapIssue = (issue, isDone) => {
        const { summary, assignee, duedate, resolutiondate } = issue.fields;
        const member = TEAM_MEMBERS.find(m => assignee && m.name.toLowerCase().includes(assignee.displayName?.split(" ")[0].toLowerCase()));
        if (!member) return null;
        let dueDateKey = null;
        if (duedate) { const dd = new Date(duedate); dd.setHours(0,0,0,0); dueDateKey = dateKey(dd); }
        let resolvedKey = null;
        if (resolutiondate) { const rd = new Date(resolutiondate); rd.setHours(0,0,0,0); resolvedKey = dateKey(rd); }
        return { id: `jira-${issue.id}`, title: summary, memberId: member.id, startKey: null, endKey: null, fromJira: true, jiraKey: issue.key, status: issue.fields.status?.name, dueDateKey, resolvedKey, isDone: isDone || false };
      };

      const active = (activeData.issues || []).map(i => mapIssue(i, false)).filter(Boolean);
      const done = (doneData.issues || []).map(i => mapIssue(i, true)).filter(Boolean);

      updateAssignments(p => [...p.filter(a => !a.fromJira), ...active, ...done]);
      setSyncStatus({ type: "success", message: `Synced ${active.length} active + ${done.length} completed from WOPS` });
    } catch(err) { setSyncStatus({ type: "error", message: `Sync failed: ${err.message}` }); }
    setSyncing(false);
  };

  const totalTasks = assignments.length;
  const jiraTasks = assignments.filter(a => a.fromJira && !a.isDone).length;
  const doneTasks = assignments.filter(a => a.isDone).length;
  const manualTasks = assignments.filter(a => !a.fromJira).length;
  const monthLabel = monthGroups.map(g => g.label).join(" – ");

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", background: "#0D0F14", height: "100vh", display: "flex", flexDirection: "column", color: "#C9D1D9", overflow: "hidden" }}>

      {/* Top Bar */}
      <div style={{ background: "#161B22", borderBottom: "1px solid #21262D", padding: "0 20px", display: "flex", alignItems: "center", height: 48, flexShrink: 0, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 24 }}>
          <div style={{ width: 24, height: 24, background: "linear-gradient(135deg,#6366F1,#3B82F6)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "white" }}>T</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#F0F6FC", letterSpacing: "-0.3px" }}>TeamPlanner</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#0D1117", border: "1px solid #30363D", borderRadius: 8, padding: "3px 6px" }}>
          <button onClick={() => setMonthOffset(o => o - 1)} style={{ background: "none", border: "none", color: "#8B949E", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>‹</button>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#F0F6FC", minWidth: 180, textAlign: "center" }}>{monthLabel}</span>
          <button onClick={() => setMonthOffset(o => o + 1)} style={{ background: "none", border: "none", color: "#8B949E", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}>›</button>
        </div>
        {monthOffset !== 0 && <button onClick={() => setMonthOffset(0)} style={{ background: "none", border: "1px solid #30363D", color: "#8B949E", fontSize: 11, padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}>Today</button>}

        {/* Done toggle */}
        <button onClick={() => setShowDone(v => !v)} style={{ background: showDone ? "#0D2818" : "none", border: `1px solid ${showDone ? DONE_COLOR + "66" : "#30363D"}`, color: showDone ? DONE_COLOR : "#484F58", fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontWeight: 600, transition: "all 0.15s" }}>
          <span style={{ fontSize: 9 }}>●</span> {showDone ? "Hide" : "Show"} Done
        </button>

        <div style={{ flex: 1 }} />
        <SaveStatus status={saveStatus} />
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginLeft: 16, marginRight: 16 }}>
          {[{ label: "Active", value: jiraTasks, color: "#3B82F6" }, { label: "Done", value: doneTasks, color: DONE_COLOR }, { label: "Manual", value: manualTasks, color: "#6366F1" }].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#484F58", marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <button onClick={syncFromJira} disabled={syncing} style={{ background: syncing ? "#21262D" : "linear-gradient(135deg,#1D6FE8,#3B82F6)", border: "1px solid #2D6DB5", color: "white", padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, marginRight: 8, opacity: syncing ? 0.7 : 1 }}>
          <span style={{ fontSize: 13, display: "inline-block", animation: syncing ? "spin 1s linear infinite" : "none" }}>⟳</span>
          {syncing ? "Syncing…" : "Sync WOPS"}
        </button>
        <button onClick={() => openAdd(1, TODAY_KEY)} style={{ background: "#238636", border: "1px solid #2EA043", color: "white", padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add
        </button>
      </div>

      {syncStatus && (
        <div style={{ background: syncStatus.type === "success" ? "#0D3321" : "#3D1414", borderBottom: `1px solid ${syncStatus.type === "success" ? "#2EA043" : "#F85149"}`, padding: "6px 20px", fontSize: 12, color: syncStatus.type === "success" ? "#3FB950" : "#F85149", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span>{syncStatus.message}</span>
          <button onClick={() => setSyncStatus(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      )}

      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#484F58", fontSize: 13 }}>
          <span style={{ display: "inline-block", animation: "spin 1s linear infinite", marginRight: 8 }}>⟳</span> Loading…
        </div>
      ) : (
        <div ref={gridRef} style={{ flex: 1, overflow: "auto" }}>
          {colW > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: SIDEBAR_W }} />
                {DAYS.map((_, i) => <col key={i} style={{ width: colW }} />)}
              </colgroup>
              <thead>
                <tr style={{ background: "#161B22" }}>
                  <th style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #21262D", padding: "5px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#484F58", letterSpacing: "0.06em", position: "sticky", top: 0, zIndex: 20, background: "#161B22" }}>TEAM</th>
                  {monthGroups.map(g => <th key={g.key} colSpan={g.count} style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #21262D", padding: "5px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8B949E", letterSpacing: "0.05em", position: "sticky", top: 0, zIndex: 19, background: "#161B22" }}>{g.label.toUpperCase()}</th>)}
                </tr>
                <tr>
                  <th style={{ borderBottom: "1px solid #30363D", borderRight: "1px solid #21262D", position: "sticky", top: 27, zIndex: 20, background: "#161B22" }} />
                  {weekGroups.map(g => <th key={g.key} colSpan={g.count} style={{ borderBottom: "1px solid #30363D", borderRight: "1px solid #21262D", padding: "3px 5px", textAlign: "left", fontSize: 9, fontWeight: 600, color: "#484F58", background: "#161B22", position: "sticky", top: 27, zIndex: 19 }}>{g.label}</th>)}
                </tr>
                <tr>
                  <th style={{ borderBottom: "2px solid #30363D", borderRight: "1px solid #21262D", position: "sticky", top: 50, zIndex: 20, background: "#0D0F14" }} />
                  {DAYS.map((d, i) => {
                    const isToday = dateKey(d) === TODAY_KEY;
                    return <th key={i} style={{ borderBottom: "2px solid #30363D", borderRight: "1px solid #1A1F26", padding: "2px 0", textAlign: "center", fontSize: 9, color: isToday ? "#6366F1" : "#484F58", fontWeight: isToday ? 800 : 400, background: isToday ? "#1A1F2E" : "#0D0F14", position: "sticky", top: 50, zIndex: 19 }}>{isToday ? "•" : d.getDate()}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {TEAM_MEMBERS.map(member => {
                  const allTasks = assignments.filter(a => a.memberId === member.id);
                  const mTasks = allTasks.filter(a => showDone ? true : !a.isDone);
                  const isExpanded = expanded[member.id];
                  const visibleDays = allTasks.filter(a => a.startKey && a.endKey).reduce((s, a) => {
                    const bar = getBarSpan(a.startKey, a.endKey, dayKeys);
                    return s + (bar ? bar.span : 0);
                  }, 0);
                  const pct = Math.min(100, Math.round((visibleDays / NUM_DAYS) * 100));
                  const barColor = pct > 80 ? "#F85149" : pct > 60 ? "#F59E0B" : member.color;

                  return [
                    <tr key={`hdr-${member.id}`} style={{ background: "#161B22", cursor: "pointer" }} onClick={() => setExpanded(p => ({ ...p, [member.id]: !p[member.id] }))}>
                      <td style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #21262D", padding: "0 10px", height: 44, position: "sticky", left: 0, zIndex: 10, background: "#161B22" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 9, color: "#484F58", userSelect: "none", width: 10 }}>{isExpanded ? "▾" : "▸"}</span>
                          <div style={{ width: 26, height: 26, borderRadius: 7, background: `${member.color}22`, border: `1px solid ${member.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: member.color, flexShrink: 0 }}>{member.initials}</div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#F0F6FC", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{member.name}</div>
                            <div style={{ fontSize: 9, color: "#484F58" }}>{mTasks.length} task{mTasks.length !== 1 ? "s" : ""}</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: barColor }}>{pct}%</span>
                            <div style={{ width: 36, height: 3, background: "#21262D", borderRadius: 2 }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 2 }} />
                            </div>
                          </div>
                        </div>
                      </td>
                      {DAYS.map((d, i) => <td key={i} style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #1A1F26", background: dateKey(d) === TODAY_KEY ? "#1A1F2E33" : "transparent" }} />)}
                    </tr>,

                    isExpanded && mTasks.length === 0 && (
                      <tr key={`empty-${member.id}`}>
                        <td style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #21262D", padding: "0 12px", height: 30, position: "sticky", left: 0, zIndex: 10, background: "#0D0F14" }}>
                          <span style={{ fontSize: 10, color: "#484F58", fontStyle: "italic" }}>No tasks</span>
                        </td>
                        {DAYS.map((d, i) => <td key={i} style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #1A1F26", background: dateKey(d) === TODAY_KEY ? "#1A1F2E11" : "transparent", cursor: "crosshair" }} onClick={() => openAdd(member.id, dateKey(d))} />)}
                      </tr>
                    ),

                    isExpanded && mTasks.map(a => {
                      const bar = a.startKey && a.endKey ? getBarSpan(a.startKey, a.endKey, dayKeys) : null;
                      const dueIdx = a.dueDateKey ? dayKeys.findIndex(k => k === a.dueDateKey) : -1;
                      const resolvedIdx = a.resolvedKey ? dayKeys.findIndex(k => k === a.resolvedKey) : -1;

                      const cells = [];
                      let i = 0;
                      while (i < NUM_DAYS) {
                        const dk = dayKeys[i];
                        const isToday = dk === TODAY_KEY;
                        const isBarStart = bar && bar.sIdx === i;
                        const isDueDay = !a.isDone && a.fromJira && dueIdx === i;
                        const isDoneDay = a.isDone && resolvedIdx === i;

                        if (isBarStart) {
                          cells.push(
                            <td key={i} colSpan={bar.span} style={{ borderBottom: "1px solid #21262D", borderRight: "none", background: isToday ? "#1A1F2E11" : "transparent", padding: "3px 2px", cursor: "pointer" }} onClick={e => openEdit(e, a)}>
                              <div onMouseEnter={e => setTooltip({ id: a.id, x: e.clientX, y: e.clientY, a })} onMouseLeave={() => setTooltip(null)}
                                style={{ height: 22, borderRadius: 4, background: `linear-gradient(135deg,${member.color}EE,${member.color}99)`, borderLeft: `3px solid ${member.color}`, display: "flex", alignItems: "center", padding: "0 6px", boxShadow: `0 1px 4px ${member.color}44`, overflow: "hidden", cursor: "pointer" }}>
                                <span style={{ fontSize: 10, fontWeight: 600, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 2px rgba(0,0,0,.5)" }}>{a.title}</span>
                              </div>
                            </td>
                          );
                          i += bar.span;
                        } else if (isDueDay) {
                          cells.push(
                            <td key={i} style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #1A1F26", background: isToday ? "#1A1F2E11" : "transparent", padding: "3px 2px", cursor: "pointer" }} onClick={e => openEdit(e, a)}>
                              <div onMouseEnter={e => setTooltip({ id: a.id, x: e.clientX, y: e.clientY, a })} onMouseLeave={() => setTooltip(null)}
                                style={{ height: 22, borderRadius: 4, background: `${member.color}22`, border: `1px dashed ${member.color}88`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 8, fontWeight: 800, color: member.color }}>DUE</span>
                              </div>
                            </td>
                          );
                          i++;
                        } else if (isDoneDay) {
                          cells.push(
                            <td key={i} style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #1A1F26", background: isToday ? "#1A1F2E11" : "transparent", padding: "3px 2px", cursor: "pointer" }} onClick={e => openEdit(e, a)}>
                              <div onMouseEnter={e => setTooltip({ id: a.id, x: e.clientX, y: e.clientY, a })} onMouseLeave={() => setTooltip(null)}
                                style={{ height: 22, borderRadius: 4, background: `${DONE_COLOR}22`, border: `1px dashed ${DONE_COLOR}88`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <span style={{ fontSize: 8, fontWeight: 800, color: DONE_COLOR }}>DONE</span>
                              </div>
                            </td>
                          );
                          i++;
                        } else {
                          if (bar && i > bar.sIdx && i < bar.sIdx + bar.span) { i++; continue; }
                          cells.push(
                            <td key={i} style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #1A1F26", background: isToday ? "#1A1F2E11" : "transparent", cursor: "crosshair" }} onClick={() => openAdd(member.id, dk)} />
                          );
                          i++;
                        }
                      }

                      return (
                        <tr key={`task-${a.id}`}>
                          <td style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #21262D", padding: "0 10px 0 28px", height: 30, position: "sticky", left: 0, zIndex: 10, background: "#0D0F14", cursor: "pointer" }} onClick={e => openEdit(e, a)}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              {a.fromJira && <span style={{ fontSize: 8, fontWeight: 700, background: a.isDone ? "#0D2818" : "#1D3557", color: a.isDone ? DONE_COLOR : "#3B82F6", padding: "1px 3px", borderRadius: 3, flexShrink: 0 }}>{a.isDone ? "✓" : "J"}</span>}
                              <span style={{ fontSize: 10, color: a.isDone ? "#484F58" : "#8B949E", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 138, textDecoration: a.isDone ? "line-through" : "underline dotted #484F58" }}>{a.title}</span>
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

      {tooltip && (
        <div style={{ position: "fixed", left: tooltip.x + 14, top: tooltip.y - 80, background: "#1C2128", border: "1px solid #30363D", borderRadius: 8, padding: "10px 14px", fontSize: 12, pointerEvents: "none", zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,.6)", minWidth: 180 }}>
          <div style={{ fontWeight: 700, color: "#F0F6FC", marginBottom: 4 }}>{tooltip.a.title}</div>
          <div style={{ color: "#8B949E", fontSize: 11 }}>{TEAM_MEMBERS.find(m => m.id === tooltip.a.memberId)?.name}</div>
          {tooltip.a.startKey && <div style={{ color: "#484F58", fontSize: 10, marginTop: 3 }}>{new Date(tooltip.a.startKey + "T12:00:00").toLocaleDateString("default", { month: "short", day: "numeric" })} → {new Date(tooltip.a.endKey + "T12:00:00").toLocaleDateString("default", { month: "short", day: "numeric" })}</div>}
          {tooltip.a.dueDateKey && !tooltip.a.isDone && <div style={{ color: "#F59E0B", fontSize: 10, marginTop: 3 }}>Due {new Date(tooltip.a.dueDateKey + "T12:00:00").toLocaleDateString("default", { month: "short", day: "numeric" })}</div>}
          {tooltip.a.resolvedKey && tooltip.a.isDone && <div style={{ color: DONE_COLOR, fontSize: 10, marginTop: 3 }}>Resolved {new Date(tooltip.a.resolvedKey + "T12:00:00").toLocaleDateString("default", { month: "short", day: "numeric" })}</div>}
          {tooltip.a.status && <div style={{ color: "#8B949E", fontSize: 10, marginTop: 2 }}>Status: {tooltip.a.status}</div>}
          {tooltip.a.fromJira && tooltip.a.jiraKey && <div style={{ color: "#3B82F6", fontSize: 10, marginTop: 3 }}>↗ {tooltip.a.jiraKey} · click to open</div>}
        </div>
      )}

      {showModal && (
        <div onClick={e => e.target === e.currentTarget && setShowModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(4px)" }}>
          <div style={{ background: "#161B22", border: "1px solid #30363D", borderRadius: 12, padding: 24, width: 400, boxShadow: "0 24px 60px rgba(0,0,0,.7)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#F0F6FC" }}>{editItem ? "Edit Assignment" : "New Assignment"}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "#8B949E", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: "#8B949E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Title</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Homepage Redesign" autoFocus style={{ display: "block", width: "100%", marginTop: 6, background: "#0D1117", border: "1px solid #30363D", borderRadius: 6, padding: "8px 10px", color: "#F0F6FC", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#8B949E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Assign To</label>
                <select value={form.memberId} onChange={e => setForm(f => ({ ...f, memberId: Number(e.target.value) }))} style={{ display: "block", width: "100%", marginTop: 6, background: "#0D1117", border: "1px solid #30363D", borderRadius: 6, padding: "8px 10px", color: "#F0F6FC", fontSize: 13, outline: "none", boxSizing: "border-box", cursor: "pointer" }}>
                  {TEAM_MEMBERS.map(m => <option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
                </select>
              </div>
              {!form.fromJira && (
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "#8B949E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Start Date</label>
                    <input type="date" value={form.startKey} onChange={e => setForm(f => ({ ...f, startKey: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 6, background: "#0D1117", border: "1px solid #30363D", borderRadius: 6, padding: "8px 10px", color: "#F0F6FC", fontSize: 13, outline: "none", boxSizing: "border-box", cursor: "pointer", colorScheme: "dark" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "#8B949E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>End Date</label>
                    <input type="date" value={form.endKey} min={form.startKey} onChange={e => setForm(f => ({ ...f, endKey: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 6, background: "#0D1117", border: "1px solid #30363D", borderRadius: 6, padding: "8px 10px", color: "#F0F6FC", fontSize: 13, outline: "none", boxSizing: "border-box", cursor: "pointer", colorScheme: "dark" }} />
                  </div>
                </div>
              )}
              {form.endKey < form.startKey && <div style={{ fontSize: 11, color: "#F85149" }}>End date must be after start date.</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {editItem && <button onClick={() => del(editItem.id)} style={{ flex: 1, background: "transparent", border: "1px solid #F8514933", color: "#F85149", padding: 8, borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Delete</button>}
                <button onClick={save} disabled={!form.fromJira && form.endKey < form.startKey} style={{ flex: 2, background: "#238636", border: "1px solid #2EA043", color: "white", padding: 8, borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>{editItem ? "Save Changes" : "Add Assignment"}</button>
              </div>
              {editItem?.fromJira && editItem?.jiraKey && (
                <a href={`${JIRA_BASE}/${editItem.jiraKey}`} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4, color: "#3B82F6", fontSize: 12, textDecoration: "none", padding: 7, borderRadius: 6, border: "1px solid #1D3557", background: "#0D1117" }}>
                  <span>↗</span> View {editItem.jiraKey} in Jira
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing: border-box }
        ::-webkit-scrollbar { width: 6px; height: 6px }
        ::-webkit-scrollbar-track { background: #0D0F14 }
        ::-webkit-scrollbar-thumb { background: #30363D; border-radius: 3px }
        tbody tr:hover > td { background: #ffffff04 !important }
      `}</style>
    </div>
  );
}