import { useState, useRef, useEffect } from "react";

const TEAM_MEMBERS = [
  { id: 1, name: "Alex Rivera", role: "Engineering Lead", color: "#3B82F6", light: "#DBEAFE" },
  { id: 2, name: "Jordan Lee", role: "Product Design", color: "#8B5CF6", light: "#EDE9FE" },
  { id: 3, name: "Sam Chen", role: "Backend Dev", color: "#10B981", light: "#D1FAE5" },
  { id: 4, name: "Taylor Kim", role: "Frontend Dev", color: "#F59E0B", light: "#FEF3C7" },
  { id: 5, name: "Morgan Davis", role: "Data Analyst", color: "#EF4444", light: "#FEE2E2" },
  { id: 6, name: "Casey Park", role: "QA Engineer", color: "#EC4899", light: "#FCE7F3" },
];

const INITIAL_ASSIGNMENTS = [
  { id: 101, memberId: 1, title: "API Redesign", startWeek: 0, duration: 3, row: 0 },
  { id: 102, memberId: 2, title: "Dashboard UX", startWeek: 1, duration: 2, row: 0 },
  { id: 103, memberId: 3, title: "DB Migration", startWeek: 0, duration: 2, row: 0 },
  { id: 104, memberId: 4, title: "Component Library", startWeek: 2, duration: 4, row: 0 },
  { id: 105, memberId: 5, title: "Q2 Analytics", startWeek: 0, duration: 2, row: 0 },
  { id: 106, memberId: 6, title: "Regression Testing", startWeek: 1, duration: 3, row: 0 },
  { id: 107, memberId: 1, title: "Auth Service", startWeek: 4, duration: 2, row: 0 },
  { id: 108, memberId: 2, title: "Mobile Prototypes", startWeek: 4, duration: 3, row: 0 },
  { id: 109, memberId: 3, title: "Cache Layer", startWeek: 3, duration: 2, row: 0 },
  { id: 110, memberId: 5, title: "KPI Reporting", startWeek: 3, duration: 3, row: 0 },
];

const NUM_WEEKS = 12;

function getWeekLabel(weekOffset) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay() + weekOffset * 7);
  const month = startOfWeek.toLocaleString("default", { month: "short" });
  const day = startOfWeek.getDate();
  return `${month} ${day}`;
}

export default function TeamCalendar() {
  const [assignments, setAssignments] = useState(INITIAL_ASSIGNMENTS);
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [hoveredWeek, setHoveredWeek] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState({ title: "", memberId: 1, startWeek: 0, duration: 1 });
  const [tooltip, setTooltip] = useState(null);
  const [filter, setFilter] = useState(null);
  const gridRef = useRef(null);
  const nextId = useRef(200);
  const [weekWidth, setWeekWidth] = useState(0);

  const weeks = Array.from({ length: NUM_WEEKS }, (_, i) => i);

  useEffect(() => {
    const measure = () => {
      if (gridRef.current) {
        const w = gridRef.current.offsetWidth / NUM_WEEKS;
        setWeekWidth(w);
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
    const offsetX = e.clientX - rect.left;
    const offsetWeeks = Math.floor(offsetX / weekWidth);
    setDragging(assignment);
    setDragOffset(offsetWeeks);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e, targetWeek, memberId) => {
    e.preventDefault();
    if (!dragging) return;
    const newStart = Math.max(0, Math.min(NUM_WEEKS - dragging.duration, targetWeek - dragOffset));
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === dragging.id ? { ...a, startWeek: newStart, memberId } : a
      )
    );
    setDragging(null);
    setHoveredWeek(null);
  };

  const handleDragOver = (e, week) => {
    e.preventDefault();
    setHoveredWeek(week);
  };

  const openAdd = (memberId, startWeek) => {
    setEditItem(null);
    setForm({ title: "", memberId, startWeek, duration: 2 });
    setShowModal(true);
  };

  const openEdit = (e, assignment) => {
    e.stopPropagation();
    setEditItem(assignment);
    setForm({
      title: assignment.title,
      memberId: assignment.memberId,
      startWeek: assignment.startWeek,
      duration: assignment.duration,
    });
    setShowModal(true);
  };

  const saveAssignment = () => {
    if (!form.title.trim()) return;
    if (editItem) {
      setAssignments((prev) =>
        prev.map((a) => (a.id === editItem.id ? { ...a, ...form } : a))
      );
    } else {
      setAssignments((prev) => [
        ...prev,
        { id: nextId.current++, ...form },
      ]);
    }
    setShowModal(false);
  };

  const deleteAssignment = (id) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
    setShowModal(false);
  };

  const currentWeekIdx = 0;

  return (
    <div style={{
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      background: "#0F1117",
      minHeight: "100vh",
      color: "#E2E8F0",
      padding: "0",
    }}>
      <div style={{
        background: "linear-gradient(135deg, #1A1D2E 0%, #0F1117 100%)",
        borderBottom: "1px solid #1E2235",
        padding: "24px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: 8, height: 32, background: "linear-gradient(180deg, #3B82F6, #8B5CF6)",
              borderRadius: 4,
            }} />
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", color: "#F1F5F9" }}>
                Team Planner
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: "#64748B", marginTop: 2 }}>
                Executive Capacity View · {NUM_WEEKS} Week Outlook
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => openAdd(1, currentWeekIdx)}
          style={{
            background: "linear-gradient(135deg, #3B82F6, #6366F1)",
            border: "none",
            color: "white",
            padding: "10px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            boxShadow: "0 4px 15px rgba(99,102,241,0.4)",
          }}
        >
          <span style={{ fontSize: 16 }}>+</span> Add Assignment
        </button>
      </div>

      <div style={{ padding: "24px 32px", display: "flex", gap: 24 }}>
        <div style={{
          width: 200,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 8px" }}>
            Team Members
          </p>
          {TEAM_MEMBERS.map((m) => (
            <div
              key={m.id}
              onClick={() => setFilter(filter === m.id ? null : m.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                cursor: "pointer",
                background: filter === m.id ? "#1E2235" : "transparent",
                border: `1px solid ${filter === m.id ? m.color + "55" : "transparent"}`,
                transition: "all 0.15s",
              }}
            >
              <div style={{
                width: 10, height: 10,
                borderRadius: "50%",
                background: m.color,
                boxShadow: `0 0 8px ${m.color}88`,
                flexShrink: 0,
              }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#CBD5E1" }}>{m.name}</div>
                <div style={{ fontSize: 10, color: "#475569" }}>{m.role}</div>
              </div>
            </div>
          ))}
          {filter && (
            <button
              onClick={() => setFilter(null)}
              style={{
                marginTop: 4,
                background: "transparent",
                border: "1px solid #2D3748",
                color: "#64748B",
                padding: "6px 10px",
                borderRadius: 6,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              Clear filter
            </button>
          )}

          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#475569", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 8px" }}>
              Summary
            </p>
            {TEAM_MEMBERS.map((m) => {
              const count = assignments.filter((a) => a.memberId === m.id).length;
              const totalWeeks = assignments.filter((a) => a.memberId === m.id).reduce((s, a) => s + a.duration, 0);
              return (
                <div key={m.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#475569", marginBottom: 3 }}>
                    <span>{m.name.split(" ")[0]}</span>
                    <span>{count} tasks</span>
                  </div>
                  <div style={{ height: 3, background: "#1E2235", borderRadius: 2 }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, (totalWeeks / NUM_WEEKS) * 100)}%`,
                      background: m.color,
                      borderRadius: 2,
                      transition: "width 0.3s",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ display: "flex", marginBottom: 12, paddingLeft: 0 }}>
            {weeks.map((w) => (
              <div
                key={w}
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: w === 0 ? 700 : 500,
                  color: w === 0 ? "#60A5FA" : "#475569",
                  padding: "4px 0",
                  borderLeft: w === 0 ? "1px solid #3B82F644" : "1px solid transparent",
                  background: w === 0 ? "#3B82F608" : "transparent",
                  borderRadius: w === 0 ? "4px 4px 0 0" : 0,
                }}
              >
                {w === 0 ? "NOW" : ""}
                <div style={{ fontSize: 10, color: w === 0 ? "#60A5FA" : "#334155" }}>
                  {getWeekLabel(w)}
                </div>
              </div>
            ))}
          </div>

          <div ref={gridRef} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {byMember
              .filter((row) => !filter || row.member.id === filter)
              .map(({ member, assignments: memberAssignments }) => (
                <div key={member.id} style={{ display: "flex", position: "relative", minHeight: 56 }}>
                  {weeks.map((w) => (
                    <div
                      key={w}
                      onDragOver={(e) => handleDragOver(e, w)}
                      onDrop={(e) => handleDrop(e, w, member.id)}
                      onClick={() => openAdd(member.id, w)}
                      style={{
                        flex: 1,
                        minHeight: 56,
                        background: w === 0
                          ? "#1A2235"
                          : hoveredWeek === w && dragging
                          ? "#1E2A3A"
                          : w % 2 === 0
                          ? "#131722"
                          : "#111520",
                        borderLeft: w === 0 ? "1px solid #3B82F622" : "1px solid #1A1D2E",
                        borderBottom: "1px solid #1A1D2E",
                        cursor: "cell",
                        transition: "background 0.1s",
                      }}
                    />
                  ))}

                  <div style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    display: "flex",
                    alignItems: "center",
                    pointerEvents: "none",
                    zIndex: 1,
                  }}>
                    <div style={{
                      background: "linear-gradient(90deg, #0F1117EE 60%, transparent)",
                      padding: "0 20px 0 0",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}>
                      <div style={{
                        width: 3,
                        height: 28,
                        background: member.color,
                        borderRadius: 2,
                        flexShrink: 0,
                      }} />
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: member.color, lineHeight: 1.2 }}>{member.name.split(" ")[0]}</div>
                        <div style={{ fontSize: 9, color: "#334155", lineHeight: 1 }}>{member.role}</div>
                      </div>
                    </div>
                  </div>

                  {memberAssignments.map((a) => {
                    const left = (a.startWeek / NUM_WEEKS) * 100;
                    const width = (a.duration / NUM_WEEKS) * 100;
                    return (
                      <div
                        key={a.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, a)}
                        onDragEnd={() => { setDragging(null); setHoveredWeek(null); }}
                        onClick={(e) => openEdit(e, a)}
                        onMouseEnter={(e) => setTooltip({ id: a.id, x: e.clientX, y: e.clientY, a })}
                        onMouseLeave={() => setTooltip(null)}
                        style={{
                          position: "absolute",
                          left: `${left}%`,
                          width: `${width}%`,
                          top: "50%",
                          transform: "translateY(-50%)",
                          height: 36,
                          background: `linear-gradient(135deg, ${member.color}DD, ${member.color}99)`,
                          borderRadius: 6,
                          display: "flex",
                          alignItems: "center",
                          padding: "0 10px",
                          cursor: dragging?.id === a.id ? "grabbing" : "grab",
                          zIndex: dragging?.id === a.id ? 50 : 10,
                          boxShadow: dragging?.id === a.id
                            ? `0 8px 24px ${member.color}66`
                            : `0 2px 8px ${member.color}44`,
                          opacity: dragging?.id === a.id ? 0.6 : 1,
                          transition: "box-shadow 0.15s, opacity 0.15s",
                          overflow: "hidden",
                          border: `1px solid ${member.color}66`,
                        }}
                      >
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: "white",
                          textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {a.title}
                        </span>
                        <span style={{
                          marginLeft: "auto",
                          fontSize: 9,
                          color: "rgba(255,255,255,0.7)",
                          flexShrink: 0,
                          paddingLeft: 4,
                        }}>
                          {a.duration}w
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
          </div>

          <div style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 11,
            color: "#475569",
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3B82F6", boxShadow: "0 0 8px #3B82F6" }} />
            Current week · Drag blocks to reschedule · Click cells to add · Click blocks to edit
          </div>
        </div>
      </div>

      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x + 12,
          top: tooltip.y - 60,
          background: "#1E2235",
          border: "1px solid #2D3748",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          pointerEvents: "none",
          zIndex: 1000,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <div style={{ fontWeight: 700, color: "#F1F5F9" }}>{tooltip.a.title}</div>
          <div style={{ color: "#64748B", fontSize: 11 }}>
            {getMember(tooltip.a.memberId)?.name} · {tooltip.a.duration} week{tooltip.a.duration > 1 ? "s" : ""}
          </div>
          <div style={{ color: "#475569", fontSize: 10, marginTop: 2 }}>
            Starts {getWeekLabel(tooltip.a.startWeek)}
          </div>
        </div>
      )}

      {showModal && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 200,
            backdropFilter: "blur(4px)",
          }}
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div style={{
            background: "#1A1D2E",
            border: "1px solid #2D3748",
            borderRadius: 16,
            padding: 28,
            width: 380,
            boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#F1F5F9" }}>
                {editItem ? "Edit Assignment" : "New Assignment"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", fontSize: 18 }}
              >✕</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Assignment Title
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. API Integration"
                  style={{
                    display: "block", width: "100%", marginTop: 6,
                    background: "#0F1117", border: "1px solid #2D3748",
                    borderRadius: 8, padding: "10px 12px",
                    color: "#F1F5F9", fontSize: 13,
                    outline: "none", boxSizing: "border-box",
                  }}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Team Member
                </label>
                <select
                  value={form.memberId}
                  onChange={(e) => setForm((f) => ({ ...f, memberId: Number(e.target.value) }))}
                  style={{
                    display: "block", width: "100%", marginTop: 6,
                    background: "#0F1117", border: "1px solid #2D3748",
                    borderRadius: 8, padding: "10px 12px",
                    color: "#F1F5F9", fontSize: 13,
                    outline: "none", boxSizing: "border-box", cursor: "pointer",
                  }}
                >
                  {TEAM_MEMBERS.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} — {m.role}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Start Week
                  </label>
                  <select
                    value={form.startWeek}
                    onChange={(e) => setForm((f) => ({ ...f, startWeek: Number(e.target.value) }))}
                    style={{
                      display: "block", width: "100%", marginTop: 6,
                      background: "#0F1117", border: "1px solid #2D3748",
                      borderRadius: 8, padding: "10px 12px",
                      color: "#F1F5F9", fontSize: 13,
                      outline: "none", boxSizing: "border-box", cursor: "pointer",
                    }}
                  >
                    {weeks.map((w) => (
                      <option key={w} value={w}>
                        {w === 0 ? "This week" : `Week +${w} (${getWeekLabel(w)})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Duration (weeks)
                  </label>
                  <select
                    value={form.duration}
                    onChange={(e) => setForm((f) => ({ ...f, duration: Number(e.target.value) }))}
                    style={{
                      display: "block", width: "100%", marginTop: 6,
                      background: "#0F1117", border: "1px solid #2D3748",
                      borderRadius: 8, padding: "10px 12px",
                      color: "#F1F5F9", fontSize: 13,
                      outline: "none", boxSizing: "border-box", cursor: "pointer",
                    }}
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((d) => (
                      <option key={d} value={d}>{d} week{d > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{
                background: "#0F1117",
                borderRadius: 8,
                padding: "10px 12px",
                border: "1px solid #1E2235",
              }}>
                <div style={{ fontSize: 10, color: "#475569", marginBottom: 6 }}>Preview</div>
                <div style={{
                  height: 32,
                  background: `linear-gradient(135deg, ${getMember(form.memberId)?.color}CC, ${getMember(form.memberId)?.color}88)`,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  width: `${Math.min(100, (form.duration / 8) * 100)}%`,
                  minWidth: 80,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "white" }}>{form.title || "Assignment title"}</span>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {editItem && (
                  <button
                    onClick={() => deleteAssignment(editItem.id)}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "1px solid #EF444433",
                      color: "#EF4444",
                      padding: "10px",
                      borderRadius: 8,
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={saveAssignment}
                  style={{
                    flex: 2,
                    background: "linear-gradient(135deg, #3B82F6, #6366F1)",
                    border: "none",
                    color: "white",
                    padding: "10px",
                    borderRadius: 8,
                    fontSize: 13,
                    cursor: "pointer",
                    fontWeight: 700,
                    boxShadow: "0 4px 15px rgba(99,102,241,0.3)",
                  }}
                >
                  {editItem ? "Save Changes" : "Add Assignment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
