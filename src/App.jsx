import { useState, useRef, useEffect } from "react";

const TEAM_MEMBERS = [
  { id: 1, name: "Ryan Geraghty", role: "Director, Software Development", color: "#6366F1", initials: "RG" },
  { id: 2, name: "Michael Santilli", role: "Sr. Web Developer", color: "#3B82F6", initials: "MS" },
  { id: 3, name: "John Kaeser", role: "Sr. Developer", color: "#10B981", initials: "JK" },
  { id: 4, name: "Jason Moore", role: "Web Developer", color: "#F59E0B", initials: "JM" },
];

const NUM_WEEKS = 16;

function getWeekLabel(weekOffset) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + weekOffset * 7);
  const month = startOfWeek.toLocaleString("default", { month: "short" });
  const day = startOfWeek.getDate();
  return `${month} ${day}`;
}

function getMonthGroups() {
  const groups = [];
  let current = null;
  for (let w = 0; w < NUM_WEEKS; w++) {
    const now = new Date();
    const d = new Date(now);
    d.setDate(now.getDate() - now.getDay() + w * 7);
    const month = d.toLocaleString("default", { month: "long" });
    const year = d.getFullYear();
    const key = `${month} ${year}`;
    if (!current || current.key !== key) {
      current = { key, label: month, start: w, count: 1 };
      groups.push(current);
    } else {
      current.count++;
    }
  }
  return groups;
}

export default function TeamCalendar() {
  const [assignments, setAssignments] = useState([]);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [hoveredWeek, setHoveredWeek] = useState(null);
  const [hoveredMember, setHoveredMember] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ title: "", memberId: 1, startWeek: 0, duration: 1, fromJira: false });
  const [tooltip, setTooltip] = useState(null);
  const [filter, setFilter] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [activeTab, setActiveTab] = useState("calendar");
  const gridRef = useRef(null);
  const nextId = useRef(300);
  const [weekWidth, setWeekWidth] = useState(0);

  const weeks = Array.from({ length: NUM_WEEKS }, (_, i) => i);
  const monthGroups = getMonthGroups();

  useEffect(() => {
    const measure = () => {
      if (gridRef.current) {
        setWeekWidth(gridRef.current.offsetWidth / NUM_WEEKS);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const getMember = (id) => TEAM_MEMBERS.find((m) => m.id === id);

  const byMember = TEAM_MEMBERS.map((member) => ({
    member,
    assignments: assignments.filter((a) => a.memberId === member.id),
  }));

  const handleDragStart = (e, assignment) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setDragging(assignment);
    setDragOffset(Math.floor((e.clientX - rect.left) / weekWidth));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e, targetWeek, memberId) => {
    e.preventDefault();
    if (!dragging) return;
    const newStart = Math.max(0, Math.min(NUM_WEEKS - dragging.duration, targetWeek - dragOffset));
    setAssignments((prev) =>
      prev.map((a) => a.id === dragging.id ? { ...a, startWeek: newStart, memberId } : a)
    );
    setDragging(null);
    setHoveredWeek(null);
    setHoveredMember(null);
  };

  const openAdd = (memberId, startWeek) => {
    setEditItem(null);
    setForm({ title: "", memberId, startWeek, duration: 2, fromJira: false });
    setShowModal(true);
  };

  const openEdit = (e, assignment) => {
    e.stopPropagation();
    setEditItem(assignment);
    setForm({ title: assignment.title, memberId: assignment.memberId, startWeek: assignment.startWeek, duration: assignment.duration, fromJira: assignment.fromJira });
    setShowModal(true);
  };

  const saveAssignment = () => {
    if (!form.title.trim()) return;
    if (editItem) {
      setAssignments((prev) => prev.map((a) => a.id === editItem.id ? { ...a, ...form } : a));
    } else {
      setAssignments((prev) => [...prev, { id: nextId.current++, ...form }]);
    }
    setShowModal(false);
  };

  const deleteAssignment = (id) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    setShowModal(false);
  };

  const syncFromJira = async () => {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const res = await fetch('/api/jira');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const issues = data.issues || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      today.setDate(today.getDate() - today.getDay());

      const jiraAssignments = issues.map((issue) => {
        const { summary, assignee, duedate, created } = issue.fields;
        const member = TEAM_MEMBERS.find((m) =>
          assignee && m.name.toLowerCase().includes(assignee.displayName?.split(" ")[0].toLowerCase())
        ) || TEAM_MEMBERS[0];

        const createdDate = new Date(created);
        const startWeek = Math.max(0, Math.round((createdDate - today) / (7 * 24 * 60 * 60 * 1000)));
        let duration = 2;
        if (duedate) {
          duration = Math.max(1, Math.round((new Date(duedate) - createdDate) / (7 * 24 * 60 * 60 * 1000)));
        }

        return {
          id: `jira-${issue.id}`,
          title: summary,
          memberId: member.id,
          startWeek: Math.min(startWeek, NUM_WEEKS - 1),
          duration: Math.min(duration, NUM_WEEKS),
          fromJira: true,
          jiraKey: issue.key,
          status: issue.fields.status?.name,
        };
      });

      setAssignments((prev) => [
        ...prev.filter((a) => !a.fromJira),
        ...jiraAssignments,
      ]);
      setSyncStatus({ type: "success", message: `Synced ${jiraAssignments.length} stories from WOPS` });
    } catch (err) {
      setSyncStatus({ type: "error", message: `Sync failed: ${err.message}` });
    }
    setSyncing(false);
  };

  const totalTasks = assignments.length;
  const jiraTasks = assignments.filter((a) => a.fromJira).length;
  const manualTasks = assignments.filter((a) => !a.fromJira).length;

  return (
    <div style={{
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      background: "#0D0F14",
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      color: "#C9D1D9",
      overflow: "hidden",
    }}>

      {/* Top Bar */}
      <div style={{
        background: "#161B22",
        borderBottom: "1px solid #21262D",
        padding: "0 20px",
        display: "flex",
        alignItems: "center",
        gap: 0,
        height: 48,
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 32 }}>
          <div style={{
            width: 24, height: 24,
            background: "linear-gradient(135deg, #6366F1, #3B82F6)",
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 800, color: "white",
          }}>T</div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#F0F6FC", letterSpacing: "-0.3px" }}>TeamPlanner</span>
        </div>

        {["calendar", "team"].map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: "none", border: "none",
            color: activeTab === tab ? "#F0F6FC" : "#8B949E",
            fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
            padding: "0 14px", height: 48, cursor: "pointer",
            borderBottom: activeTab === tab ? "2px solid #6366F1" : "2px solid transparent",
            textTransform: "capitalize",
          }}>{tab}</button>
        ))}

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", gap: 20, alignItems: "center", marginRight: 16 }}>
          {[
            { label: "Total", value: totalTasks },
            { label: "Jira", value: jiraTasks, color: "#3B82F6" },
            { label: "Manual", value: manualTasks, color: "#6366F1" },
          ].map((s) => (
            <div key={s.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.color || "#F0F6FC", lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#484F58", marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <button onClick={syncFromJira} disabled={syncing} style={{
          background: syncing ? "#21262D" : "linear-gradient(135deg, #1D6FE8, #3B82F6)",
          border: "1px solid #2D6DB5",
          color: "white", padding: "6px 14px",
          borderRadius: 6, fontSize: 12, fontWeight: 600,
          cursor: syncing ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", gap: 6,
          marginRight: 8, opacity: syncing ? 0.7 : 1,
        }}>
          <span style={{ fontSize: 13, display: "inline-block", animation: syncing ? "spin 1s linear infinite" : "none" }}>⟳</span>
          {syncing ? "Syncing…" : "Sync WOPS"}
        </button>

        <button onClick={() => openAdd(1, 0)} style={{
          background: "#238636", border: "1px solid #2EA043",
          color: "white", padding: "6px 14px",
          borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add
        </button>
      </div>

      {syncStatus && (
        <div style={{
          background: syncStatus.type === "success" ? "#0D3321" : "#3D1414",
          borderBottom: `1px solid ${syncStatus.type === "success" ? "#2EA043" : "#F85149"}`,
          padding: "6px 20px", fontSize: 12,
          color: syncStatus.type === "success" ? "#3FB950" : "#F85149",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <span>{syncStatus.message}</span>
          <button onClick={() => setSyncStatus(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
      )}

      {activeTab === "calendar" && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left Sidebar */}
          <div style={{
            width: 220, background: "#161B22",
            borderRight: "1px solid #21262D",
            display: "flex", flexDirection: "column",
            flexShrink: 0, overflow: "auto",
          }}>
            <div style={{ padding: "12px 12px 6px", fontSize: 10, fontWeight: 700, color: "#484F58", letterSpacing: "0.08em", textTransform: "uppercase" }}>Team</div>
            {TEAM_MEMBERS.map((m) => {
              const count = assignments.filter((a) => a.memberId === m.id).length;
              const isActive = filter === m.id;
              return (
                <div key={m.id} onClick={() => setFilter(isActive ? null : m.id)} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 12px", cursor: "pointer",
                  background: isActive ? "#1F2937" : "transparent",
                  borderLeft: `3px solid ${isActive ? m.color : "transparent"}`,
                  transition: "all 0.1s",
                }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: `${m.color}22`, border: `1px solid ${m.color}44`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: m.color, flexShrink: 0,
                  }}>{m.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? "#F0F6FC" : "#C9D1D9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                    <div style={{ fontSize: 10, color: "#484F58" }}>{count} task{count !== 1 ? "s" : ""}</div>
                  </div>
                </div>
              );
            })}

            <div style={{ margin: "12px", borderTop: "1px solid #21262D" }} />
            <div style={{ padding: "0 12px 6px", fontSize: 10, fontWeight: 700, color: "#484F58", letterSpacing: "0.08em", textTransform: "uppercase" }}>Capacity</div>
            {TEAM_MEMBERS.map((m) => {
              const totalWeeks = assignments.filter((a) => a.memberId === m.id).reduce((s, a) => s + a.duration, 0);
              const pct = Math.min(100, Math.round((totalWeeks / NUM_WEEKS) * 100));
              const barColor = pct > 80 ? "#F85149" : pct > 60 ? "#F59E0B" : m.color;
              return (
                <div key={m.id} style={{ padding: "4px 12px 8px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#484F58", marginBottom: 4 }}>
                    <span>{m.name.split(" ")[0]}</span>
                    <span style={{ color: barColor, fontWeight: 700 }}>{pct}%</span>
                  </div>
                  <div style={{ height: 4, background: "#21262D", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 2, transition: "width 0.4s" }} />
                  </div>
                </div>
              );
            })}

            <div style={{ flex: 1 }} />
            <div style={{ padding: 12, fontSize: 10, color: "#484F58", lineHeight: 1.8, borderTop: "1px solid #21262D" }}>
              <div>· Click row to add</div>
              <div>· Drag to reschedule</div>
              <div>· Click block to edit</div>
            </div>
          </div>

          {/* Calendar */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Month row */}
            <div style={{ display: "flex", background: "#161B22", borderBottom: "1px solid #21262D", flexShrink: 0 }}>
              {monthGroups.map((g) => (
                <div key={g.key} style={{
                  flex: g.count, padding: "6px 10px",
                  fontSize: 11, fontWeight: 700, color: "#8B949E",
                  borderRight: "1px solid #21262D", letterSpacing: "0.05em",
                }}>{g.label.toUpperCase()}</div>
              ))}
            </div>

            {/* Week row */}
            <div style={{ display: "flex", background: "#161B22", borderBottom: "1px solid #30363D", flexShrink: 0 }}>
              {weeks.map((w) => (
                <div key={w} style={{
                  flex: 1, textAlign: "center", padding: "4px 0",
                  fontSize: 10, color: w === 0 ? "#6366F1" : "#484F58",
                  fontWeight: w === 0 ? 700 : 400,
                  borderRight: "1px solid #21262D",
                  background: w === 0 ? "#1A1F2E" : "transparent",
                }}>
                  {w === 0 ? "NOW" : getWeekLabel(w)}
                </div>
              ))}
            </div>

            {/* Member rows */}
            <div ref={gridRef} style={{ flex: 1, overflow: "auto" }}>
              {byMember
                .filter((row) => !filter || row.member.id === filter)
                .map(({ member, assignments: memberAssignments }) => (
                  <div key={member.id} style={{
                    display: "flex", position: "relative", height: 56,
                    borderBottom: "1px solid #21262D",
                    background: hoveredMember === member.id && dragging ? "#1C2128" : "transparent",
                  }}>
                    {weeks.map((w) => (
                      <div key={w}
                        onDragOver={(e) => { e.preventDefault(); setHoveredWeek(w); setHoveredMember(member.id); }}
                        onDrop={(e) => handleDrop(e, w, member.id)}
                        onClick={() => openAdd(member.id, w)}
                        style={{
                          flex: 1, height: "100%",
                          background: w === 0 ? "#1A1F2E11" : "transparent",
                          borderRight: "1px solid #21262D",
                          cursor: "crosshair",
                        }}
                      />
                    ))}

                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      display: "flex", alignItems: "center",
                      pointerEvents: "none", zIndex: 2, paddingLeft: 8,
                    }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        background: "linear-gradient(90deg, #0D0F14 50%, transparent)",
                        paddingRight: 16,
                      }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: member.color, boxShadow: `0 0 6px ${member.color}`,
                        }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#8B949E" }}>
                          {member.name.split(" ")[0]}
                        </span>
                      </div>
                    </div>

                    {memberAssignments.map((a) => (
                      <div key={a.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, a)}
                        onDragEnd={() => { setDragging(null); setHoveredWeek(null); setHoveredMember(null); }}
                        onClick={(e) => openEdit(e, a)}
                        onMouseEnter={(e) => setTooltip({ id: a.id, x: e.clientX, y: e.clientY, a })}
                        onMouseLeave={() => setTooltip(null)}
                        style={{
                          position: "absolute",
                          left: `${(a.startWeek / NUM_WEEKS) * 100}%`,
                          width: `calc(${(a.duration / NUM_WEEKS) * 100}% - 4px)`,
                          top: 9, bottom: 9,
                          background: a.fromJira
                            ? `linear-gradient(135deg, ${member.color}99, ${member.color}66)`
                            : `linear-gradient(135deg, ${member.color}EE, ${member.color}AA)`,
                          borderRadius: 5,
                          display: "flex", alignItems: "center",
                          padding: "0 8px", cursor: "grab", zIndex: 10,
                          opacity: dragging?.id === a.id ? 0.4 : 1,
                          boxShadow: `0 1px 6px ${member.color}44`,
                          border: `1px solid ${member.color}44`,
                          borderLeft: `3px solid ${member.color}`,
                          overflow: "hidden",
                        }}
                      >
                        {a.fromJira && (
                          <span style={{
                            fontSize: 9, fontWeight: 700,
                            background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.8)",
                            padding: "1px 4px", borderRadius: 3, marginRight: 5, flexShrink: 0,
                          }}>J</span>
                        )}
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: "white",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                        }}>{a.title}</span>
                        <span style={{ marginLeft: "auto", fontSize: 9, color: "rgba(255,255,255,0.55)", paddingLeft: 6, flexShrink: 0 }}>{a.duration}w</span>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "team" && (
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {TEAM_MEMBERS.map((m) => {
              const memberTasks = assignments.filter((a) => a.memberId === m.id);
              const totalWeeks = memberTasks.reduce((s, a) => s + a.duration, 0);
              const pct = Math.min(100, Math.round((totalWeeks / NUM_WEEKS) * 100));
              return (
                <div key={m.id} style={{
                  background: "#161B22", border: "1px solid #21262D",
                  borderRadius: 12, padding: 20, borderTop: `3px solid ${m.color}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: 12,
                      background: `${m.color}22`, border: `2px solid ${m.color}55`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 15, fontWeight: 800, color: m.color,
                    }}>{m.initials}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#F0F6FC" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "#8B949E" }}>{m.role}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8B949E", marginBottom: 6 }}>
                      <span>Capacity used</span>
                      <span style={{ color: pct > 80 ? "#F85149" : m.color, fontWeight: 700 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 6, background: "#21262D", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct > 80 ? "#F85149" : m.color, borderRadius: 3 }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "#484F58", marginBottom: 8 }}>{memberTasks.length} assignment{memberTasks.length !== 1 ? "s" : ""}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {memberTasks.slice(0, 5).map((a) => (
                      <div key={a.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "5px 8px", background: "#0D1117",
                        borderRadius: 6, fontSize: 11,
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                        <span style={{ color: "#C9D1D9", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                        {a.fromJira && <span style={{ fontSize: 9, color: "#3B82F6", fontWeight: 700 }}>JIRA</span>}
                        <span style={{ color: "#484F58", fontSize: 10 }}>{a.duration}w</span>
                      </div>
                    ))}
                    {memberTasks.length > 5 && <div style={{ fontSize: 10, color: "#484F58", padding: "2px 8px" }}>+{memberTasks.length - 5} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tooltip && (
        <div style={{
          position: "fixed", left: tooltip.x + 14, top: tooltip.y - 70,
          background: "#1C2128", border: "1px solid #30363D",
          borderRadius: 8, padding: "10px 14px", fontSize: 12,
          pointerEvents: "none", zIndex: 1000,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
        }}>
          <div style={{ fontWeight: 700, color: "#F0F6FC", marginBottom: 4 }}>{tooltip.a.title}</div>
          <div style={{ color: "#8B949E", fontSize: 11 }}>{getMember(tooltip.a.memberId)?.name} · {tooltip.a.duration} week{tooltip.a.duration > 1 ? "s" : ""}</div>
          <div style={{ color: "#484F58", fontSize: 10, marginTop: 3 }}>Starts {getWeekLabel(tooltip.a.startWeek)}</div>
          {tooltip.a.fromJira && <div style={{ color: "#3B82F6", fontSize: 10, marginTop: 3 }}>↗ Jira · {tooltip.a.jiraKey}</div>}
          {tooltip.a.status && <div style={{ color: "#8B949E", fontSize: 10 }}>Status: {tooltip.a.status}</div>}
        </div>
      )}

      {showModal && (
        <div onClick={(e) => e.target === e.currentTarget && setShowModal(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 200, backdropFilter: "blur(4px)",
        }}>
          <div style={{
            background: "#161B22", border: "1px solid #30363D",
            borderRadius: 12, padding: 24, width: 400,
            boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#F0F6FC" }}>{editItem ? "Edit Assignment" : "New Assignment"}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "#8B949E", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: "#8B949E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Title</label>
                <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Homepage Redesign" autoFocus style={{
                  display: "block", width: "100%", marginTop: 6,
                  background: "#0D1117", border: "1px solid #30363D",
                  borderRadius: 6, padding: "8px 10px", color: "#F0F6FC",
                  fontSize: 13, outline: "none", boxSizing: "border-box",
                }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#8B949E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Assign To</label>
                <select value={form.memberId} onChange={(e) => setForm((f) => ({ ...f, memberId: Number(e.target.value) }))} style={{
                  display: "block", width: "100%", marginTop: 6,
                  background: "#0D1117", border: "1px solid #30363D",
                  borderRadius: 6, padding: "8px 10px", color: "#F0F6FC",
                  fontSize: 13, outline: "none", boxSizing: "border-box", cursor: "pointer",
                }}>
                  {TEAM_MEMBERS.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#8B949E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Start Week</label>
                  <select value={form.startWeek} onChange={(e) => setForm((f) => ({ ...f, startWeek: Number(e.target.value) }))} style={{
                    display: "block", width: "100%", marginTop: 6,
                    background: "#0D1117", border: "1px solid #30363D",
                    borderRadius: 6, padding: "8px 10px", color: "#F0F6FC",
                    fontSize: 13, outline: "none", boxSizing: "border-box", cursor: "pointer",
                  }}>
                    {weeks.map((w) => <option key={w} value={w}>{w === 0 ? "This week" : `+${w}w · ${getWeekLabel(w)}`}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#8B949E", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Duration</label>
                  <select value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: Number(e.target.value) }))} style={{
                    display: "block", width: "100%", marginTop: 6,
                    background: "#0D1117", border: "1px solid #30363D",
                    borderRadius: 6, padding: "8px 10px", color: "#F0F6FC",
                    fontSize: 13, outline: "none", boxSizing: "border-box", cursor: "pointer",
                  }}>
                    {[1,2,3,4,5,6,8,10,12].map((d) => <option key={d} value={d}>{d} week{d > 1 ? "s" : ""}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ background: "#0D1117", borderRadius: 6, padding: "10px 12px", border: "1px solid #21262D" }}>
                <div style={{ fontSize: 10, color: "#484F58", marginBottom: 6 }}>Preview</div>
                <div style={{
                  height: 28, borderRadius: 5,
                  background: `linear-gradient(135deg, ${getMember(form.memberId)?.color}CC, ${getMember(form.memberId)?.color}88)`,
                  display: "flex", alignItems: "center", padding: "0 10px",
                  width: `${Math.min(100, (form.duration / 6) * 100)}%`, minWidth: 80,
                  borderLeft: `3px solid ${getMember(form.memberId)?.color}`,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "white" }}>{form.title || "Assignment title"}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {editItem && (
                  <button onClick={() => deleteAssignment(editItem.id)} style={{
                    flex: 1, background: "transparent", border: "1px solid #F8514933",
                    color: "#F85149", padding: "8px", borderRadius: 6,
                    fontSize: 12, cursor: "pointer", fontWeight: 600,
                  }}>Delete</button>
                )}
                <button onClick={saveAssignment} style={{
                  flex: 2, background: "#238636", border: "1px solid #2EA043",
                  color: "white", padding: "8px", borderRadius: 6,
                  fontSize: 13, cursor: "pointer", fontWeight: 700,
                }}>{editItem ? "Save Changes" : "Add Assignment"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0D0F14; }
        ::-webkit-scrollbar-thumb { background: #30363D; border-radius: 3px; }
      `}</style>
    </div>
  );
}
