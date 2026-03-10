import { useState, useRef, useEffect } from "react";

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

function dateKey(d) { return d.toISOString().slice(0,10); }

function isWeekend(d) { const day = d.getDay(); return day === 0 || day === 6; }

// Build all weekdays for a given month offset window (startMonth offset, numMonths)
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
  const groups = [];
  let cur = null;
  days.forEach((d, i) => {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleString("default", { month: "long", year: "numeric" });
    if (!cur || cur.key !== key) { cur = { key, label, start: i, count: 1 }; groups.push(cur); }
    else cur.count++;
  });
  return groups;
}

function getWeekGroups(days) {
  const groups = [];
  let cur = null;
  days.forEach((d, i) => {
    // week key = year + week-of-year
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const wk = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    const key = `${d.getFullYear()}-${wk}`;
    if (!cur || cur.key !== key) {
      cur = { key, label: d.toLocaleDateString("default", { month: "short", day: "numeric" }), start: i, count: 1 };
      groups.push(cur);
    } else cur.count++;
  });
  return groups;
}

export default function App() {
  const [monthOffset, setMonthOffset] = useState(0);
  const [assignments, setAssignments] = useState([]);
  const [expanded, setExpanded] = useState({ 1: true, 2: true, 3: true, 4: true });
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ title: "", memberId: 1, startKey: TODAY_KEY, durationDays: 5, fromJira: false, dueDateKey: null });
  const [tooltip, setTooltip] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const gridRef = useRef(null);
  const nextId = useRef(300);
  const [colW, setColW] = useState(0);

  const DAYS = buildDays(monthOffset, 2);
  const NUM_DAYS = DAYS.length;
  const monthGroups = getMonthGroups(DAYS);
  const weekGroups = getWeekGroups(DAYS);
  const dayKeys = DAYS.map(dateKey);

  useEffect(() => {
    const measure = () => {
      if (gridRef.current) setColW((gridRef.current.offsetWidth - SIDEBAR_W) / NUM_DAYS);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [monthOffset]);

  const openAdd = (memberId, dk) => {
    setEditItem(null);
    setForm({ title: "", memberId, startKey: dk, durationDays: 5, fromJira: false, dueDateKey: null });
    setShowModal(true);
  };
  const openEdit = (e, a) => {
    e.stopPropagation();
    setEditItem(a);
    setForm({ title: a.title, memberId: a.memberId, startKey: a.startKey, durationDays: a.durationDays, fromJira: a.fromJira, dueDateKey: a.dueDateKey ?? null });
    setShowModal(true);
  };
  const save = () => {
    if (!form.title.trim()) return;
    if (editItem) setAssignments(p => p.map(a => a.id === editItem.id ? { ...a, ...form } : a));
    else setAssignments(p => [...p, { id: nextId.current++, ...form }]);
    setShowModal(false);
  };
  const del = id => { setAssignments(p => p.filter(a => a.id !== id)); setShowModal(false); };

  const handleDragStart = (e, a, startIdx) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDragging({ ...a, _startIdx: startIdx });
    setDragOffset(Math.floor((e.clientX - rect.left) / colW));
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDrop = (e, memberId, dk) => {
    e.preventDefault();
    if (!dragging || dragging.fromJira) return;
    const dropIdx = dayKeys.indexOf(dk);
    const newIdx = Math.max(0, Math.min(NUM_DAYS - dragging.durationDays, dropIdx - dragOffset));
    setAssignments(p => p.map(a => a.id === dragging.id ? { ...a, startKey: dayKeys[newIdx], memberId } : a));
    setDragging(null);
  };

  const syncFromJira = async () => {
    setSyncing(true); setSyncStatus(null);
    try {
      const jql = encodeURIComponent('status not in ("Done","Backlog","Blocked") AND assignee is not EMPTY ORDER BY duedate ASC');
      const res = await fetch(`/api/jira?jql=${jql}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const ja = (data.issues || []).map(issue => {
        const { summary, assignee, duedate } = issue.fields;
        const member = TEAM_MEMBERS.find(m => assignee && m.name.toLowerCase().includes(assignee.displayName?.split(" ")[0].toLowerCase()));
        if (!member) return null;
        let dueDateKey = null;
        if (duedate) {
          const dd = new Date(duedate); dd.setHours(0,0,0,0);
          dueDateKey = dateKey(dd);
        }
        return { id: `jira-${issue.id}`, title: summary, memberId: member.id, startKey: null, durationDays: null, fromJira: true, jiraKey: issue.key, status: issue.fields.status?.name, dueDateKey };
      });
      const filtered = ja.filter(Boolean);
      setAssignments(p => [...p.filter(a => !a.fromJira), ...filtered]);
      setSyncStatus({ type: "success", message: `Synced ${filtered.length} stories from WOPS` });
    } catch (err) { setSyncStatus({ type: "error", message: `Sync failed: ${err.message}` }); }
    setSyncing(false);
  };

  const totalTasks = assignments.length;
  const jiraTasks = assignments.filter(a => a.fromJira).length;
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

        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#0D1117", border: "1px solid #30363D", borderRadius: 8, padding: "3px 6px" }}>
          <button onClick={() => setMonthOffset(o => o - 1)} style={{ background: "none", border: "none", color: "#8B949E", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "2px 4px", borderRadius: 4 }}>‹</button>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#F0F6FC", minWidth: 180, textAlign: "center" }}>{monthLabel}</span>
          <button onClick={() => setMonthOffset(o => o + 1)} style={{ background: "none", border: "none", color: "#8B949E", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "2px 4px", borderRadius: 4 }}>›</button>
        </div>
        {monthOffset !== 0 && (
          <button onClick={() => setMonthOffset(0)} style={{ background: "none", border: "1px solid #30363D", color: "#8B949E", fontSize: 11, padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}>Today</button>
        )}

        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 20, alignItems: "center", marginRight: 16 }}>
          {[{ label: "Total", value: totalTasks }, { label: "Jira", value: jiraTasks, color: "#3B82F6" }, { label: "Manual", value: manualTasks, color: "#6366F1" }].map(s => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color || "#F0F6FC", lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#484F58", marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
        <button onClick={syncFromJira} disabled={syncing} style={{ background: syncing ? "#21262D" : "linear-gradient(135deg,#1D6FE8,#3B82F6)", border: "1px solid #2D6DB5", color: "white", padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: syncing ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, marginRight: 8, opacity: syncing ? 0.7 : 1 }}>
          <span style={{ fontSize: 13, display: "inline-block", animation: syncing ? "spin 1s linear infinite" : "none" }}>⟳</span>
          {syncing ? "Syncing…" : "Sync WOPS"}
        </button>
        <button onClick={() => openAdd(1, dayKeys[0] || TODAY_KEY)} style={{ background: "#238636", border: "1px solid #2EA043", color: "white", padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add
        </button>
      </div>

      {syncStatus && (
        <div style={{ background: syncStatus.type === "success" ? "#0D3321" : "#3D1414", borderBottom: `1px solid ${syncStatus.type === "success" ? "#2EA043" : "#F85149"}`, padding: "6px 20px", fontSize: 12, color: syncStatus.type === "success" ? "#3FB950" : "#F85149", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span>{syncStatus.message}</span>
          <button onClick={() => setSyncStatus(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* Gantt */}
      <div ref={gridRef} style={{ flex: 1, overflow: "auto" }}>
        {colW > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: SIDEBAR_W }} />
              {DAYS.map((_, i) => <col key={i} style={{ width: colW }} />)}
            </colgroup>
            <thead>
              {/* Month row */}
              <tr style={{ background: "#161B22" }}>
                <th style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #21262D", padding: "5px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#484F58", letterSpacing: "0.06em", position: "sticky", top: 0, zIndex: 20, background: "#161B22" }}>TEAM</th>
                {monthGroups.map(g => (
                  <th key={g.key} colSpan={g.count} style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #21262D", padding: "5px 10px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8B949E", letterSpacing: "0.05em", position: "sticky", top: 0, zIndex: 19, background: "#161B22" }}>{g.label.toUpperCase()}</th>
                ))}
              </tr>
              {/* Week row */}
              <tr>
                <th style={{ borderBottom: "1px solid #30363D", borderRight: "1px solid #21262D", position: "sticky", top: 27, zIndex: 20, background: "#161B22" }} />
                {weekGroups.map(g => (
                  <th key={g.key} colSpan={g.count} style={{ borderBottom: "1px solid #30363D", borderRight: "1px solid #21262D", padding: "3px 5px", textAlign: "left", fontSize: 9, fontWeight: 600, color: "#484F58", background: "#161B22", position: "sticky", top: 27, zIndex: 19 }}>{g.label}</th>
                ))}
              </tr>
              {/* Day row */}
              <tr>
                <th style={{ borderBottom: "2px solid #30363D", borderRight: "1px solid #21262D", position: "sticky", top: 50, zIndex: 20, background: "#0D0F14" }} />
                {DAYS.map((d, i) => {
                  const isToday = dateKey(d) === TODAY_KEY;
                  return (
                    <th key={i} style={{ borderBottom: "2px solid #30363D", borderRight: "1px solid #1A1F26", padding: "2px 0", textAlign: "center", fontSize: 9, color: isToday ? "#6366F1" : "#484F58", fontWeight: isToday ? 800 : 400, background: isToday ? "#1A1F2E" : "#0D0F14", position: "sticky", top: 50, zIndex: 19 }}>
                      {isToday ? "•" : d.getDate()}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {TEAM_MEMBERS.map(member => {
                const mTasks = assignments.filter(a => a.memberId === member.id);
                const isExpanded = expanded[member.id];
                // capacity: count working days in view that are covered
                const viewKeys = new Set(dayKeys);
                let coveredDays = 0;
                mTasks.filter(a => a.startKey && a.durationDays).forEach(a => {
                  const sIdx = dayKeys.indexOf(a.startKey);
                  if (sIdx >= 0) coveredDays += Math.min(a.durationDays, NUM_DAYS - sIdx);
                });
                const pct = Math.min(100, Math.round((coveredDays / NUM_DAYS) * 100));
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
                    {DAYS.map((d, i) => (
                      <td key={i}
                        style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #1A1F26", background: dateKey(d) === TODAY_KEY ? "#1A1F2E33" : "transparent" }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => handleDrop(e, member.id, dateKey(d))}
                      />
                    ))}
                  </tr>,

                  isExpanded && mTasks.length === 0 && (
                    <tr key={`empty-${member.id}`}>
                      <td style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #21262D", padding: "0 12px", height: 30, position: "sticky", left: 0, zIndex: 10, background: "#0D0F14" }}>
                        <span style={{ fontSize: 10, color: "#484F58", fontStyle: "italic" }}>No tasks</span>
                      </td>
                      {DAYS.map((d, i) => (
                        <td key={i}
                          style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #1A1F26", background: dateKey(d) === TODAY_KEY ? "#1A1F2E11" : "transparent", cursor: "crosshair" }}
                          onClick={() => openAdd(member.id, dateKey(d))}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => handleDrop(e, member.id, dateKey(d))}
                        />
                      ))}
                    </tr>
                  ),

                  isExpanded && mTasks.map(a => {
                    const startIdx = dayKeys.indexOf(a.startKey);
                    const dueIdx = a.dueDateKey ? dayKeys.indexOf(a.dueDateKey) : -1;
                    // For tasks that start before the current view, clamp
                    const visibleStart = startIdx >= 0 ? startIdx : -1;

                    return (
                      <tr key={`task-${a.id}`}>
                        <td style={{ borderBottom: "1px solid #21262D", borderRight: "1px solid #21262D", padding: "0 10px 0 28px", height: 30, position: "sticky", left: 0, zIndex: 10, background: "#0D0F14" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            {a.fromJira && <span style={{ fontSize: 8, fontWeight: 700, background: "#1D3557", color: "#3B82F6", padding: "1px 3px", borderRadius: 3, flexShrink: 0 }}>J</span>}
                            <span style={{ fontSize: 10, color: "#8B949E", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 138 }}>{a.title}</span>
                          </div>
                        </td>
                        {DAYS.map((d, i) => {
                          const dk = dateKey(d);
                          const isToday = dk === TODAY_KEY;
                          const isDueDay = a.fromJira && dueIdx === i;
                          const isStart = !a.fromJira && visibleStart === i;
                          const span = isStart ? Math.min(a.durationDays, NUM_DAYS - i) : 1;

                          return (
                            <td key={i} colSpan={isStart ? span : 1}
                              style={{
                                borderBottom: "1px solid #21262D",
                                borderRight: isStart && span > 1 ? "none" : "1px solid #1A1F26",
                                background: isToday ? "#1A1F2E11" : "transparent",
                                padding: isStart || isDueDay ? "3px 2px" : 0,
                                cursor: isStart || isDueDay ? "pointer" : "crosshair",
                              }}
                              onClick={isStart || isDueDay ? e => openEdit(e, a) : () => openAdd(member.id, dk)}
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => handleDrop(e, member.id, dk)}
                            >
                              {isStart && (
                                <div
                                  draggable
                                  onDragStart={e => handleDragStart(e, a, i)}
                                  onDragEnd={() => setDragging(null)}
                                  onMouseEnter={e => setTooltip({ id: a.id, x: e.clientX, y: e.clientY, a })}
                                  onMouseLeave={() => setTooltip(null)}
                                  style={{ height: 22, borderRadius: 4, background: `linear-gradient(135deg,${member.color}EE,${member.color}99)`, borderLeft: `3px solid ${member.color}`, display: "flex", alignItems: "center", padding: "0 6px", boxShadow: `0 1px 4px ${member.color}44`, opacity: dragging?.id === a.id ? 0.4 : 1, cursor: "grab", overflow: "hidden" }}>
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 1px 2px rgba(0,0,0,.5)" }}>{a.title}</span>
                                </div>
                              )}
                              {isDueDay && (
                                <div
                                  onMouseEnter={e => setTooltip({ id: a.id, x: e.clientX, y: e.clientY, a })}
                                  onMouseLeave={() => setTooltip(null)}
                                  style={{ height: 22, borderRadius: 4, background: `${member.color}22`, border: `1px dashed ${member.color}88`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                                  <span style={{ fontSize: 8, fontWeight: 800, color: member.color }}>DUE</span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                ];
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{ position: "fixed", left: tooltip.x + 14, top: tooltip.y - 80, background: "#1C2128", border: "1px solid #30363D", borderRadius: 8, padding: "10px 14px", fontSize: 12, pointerEvents: "none", zIndex: 1000, boxShadow: "0 8px 32px rgba(0,0,0,.6)", minWidth: 180 }}>
          <div style={{ fontWeight: 700, color: "#F0F6FC", marginBottom: 4 }}>{tooltip.a.title}</div>
          <div style={{ color: "#8B949E", fontSize: 11 }}>{TEAM_MEMBERS.find(m => m.id === tooltip.a.memberId)?.name}</div>
          {tooltip.a.durationDays && tooltip.a.startKey && <div style={{ color: "#484F58", fontSize: 10, marginTop: 3 }}>{tooltip.a.durationDays} day{tooltip.a.durationDays > 1 ? "s" : ""} · starts {new Date(tooltip.a.startKey + "T12:00:00").toLocaleDateString("default", { month: "short", day: "numeric" })}</div>}
          {tooltip.a.dueDateKey && <div style={{ color: "#F59E0B", fontSize: 10, marginTop: 3 }}>Due {new Date(tooltip.a.dueDateKey + "T12:00:00").toLocaleDateString("default", { month: "short", day: "numeric" })}</div>}
          {tooltip.a.status && <div style={{ color: "#8B949E", fontSize: 10, marginTop: 2 }}>Status: {tooltip.a.status}</div>}
          {tooltip.a.fromJira && tooltip.a.jiraKey && <div style={{ color: "#3B82F6", fontSize: 10, marginTop: 3 }}>↗ {tooltip.a.jiraKey} · click to open</div>}
        </div>
      )}

      {/* Modal */}
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
                    <select value={form.startKey} onChange={e => setForm(f => ({ ...f, startKey: e.target.value }))} style={{ display: "block", width: "100%", marginTop: 6, background: "#0D1117", border: "1px solid #30363D", borderRadius: 6, padding: "8px 10px", color: "#F0F6FC", fontSize: 13, outline: "none", boxSizing: "border-box", cursor: "pointer" }}>
                      {DAYS.map(d => <option key={dateKey(d)} value={dateKey(d)}>{d.toLocaleDateString("default", { weekday: "short", month: "short", day: "numeric" })}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: "#8B949E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Duration</label>
                    <select value={form.durationDays} onChange={e => setForm(f => ({ ...f, durationDays: Number(e.target.value) }))} style={{ display: "block", width: "100%", marginTop: 6, background: "#0D1117", border: "1px solid #30363D", borderRadius: 6, padding: "8px 10px", color: "#F0F6FC", fontSize: 13, outline: "none", boxSizing: "border-box", cursor: "pointer" }}>
                      {[1,2,3,4,5,6,7,8,9,10,15,20].map(d => <option key={d} value={d}>{d} day{d > 1 ? "s" : ""}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {editItem && <button onClick={() => del(editItem.id)} style={{ flex: 1, background: "transparent", border: "1px solid #F8514933", color: "#F85149", padding: 8, borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Delete</button>}
                <button onClick={save} style={{ flex: 2, background: "#238636", border: "1px solid #2EA043", color: "white", padding: 8, borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 700 }}>{editItem ? "Save Changes" : "Add Assignment"}</button>
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