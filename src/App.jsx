import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const TEAM_MEMBERS = [
  { id: 1, name: "Ryan Geraghty", role: "Director, Software Development", color: "#1d4ed8", initials: "RG" },
  { id: 2, name: "Michael Santilli", role: "Sr. Web Developer", color: "#0f766e", initials: "MS" },
  { id: 3, name: "John Kaeser", role: "Sr. Developer", color: "#c2410c", initials: "JK" },
  { id: 4, name: "Jason Moore", role: "Web Developer", color: "#7c3aed", initials: "JM" },
];

const JIRA_BASE = "https://hmpglobal.atlassian.net/browse";
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TODAY_KEY = dateKey(TODAY);
const STORAGE_KEY = "nextPriorities";
const MILESTONE_COLORS = ["#d97706", "#4f46e5", "#db2777", "#059669", "#dc2626", "#0057b8"];
const MILESTONE_LEGEND = {
  "#d97706": "Marketing",
  "#4f46e5": "Learning Network",
  "#db2777": "LMS",
  "#059669": "Psychiatry Redefined",
  "#dc2626": "Other",
  "#0057b8": "Operations",
};
const PRIORITY_COLORS = ["#1d4ed8", "#0f766e", "#c2410c", "#7c3aed", "#be185d", "#374151"];

function dateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function addDays(d, amount) {
  const next = new Date(d);
  next.setDate(next.getDate() + amount);
  return next;
}

function fmtDate(key, options = { month: "short", day: "numeric" }) {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", options);
}

function fmtRange(startKey, endKey) {
  if (!startKey) return "Needs dates";
  if (!endKey || startKey === endKey) return fmtDate(startKey);
  return `${fmtDate(startKey)} - ${fmtDate(endKey)}`;
}

function buildTimelineDays() {
  const days = [];
  const start = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  const end = new Date(TODAY.getFullYear(), TODAY.getMonth() + 2, 0);

  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    days.push(new Date(cursor));
  }

  return days;
}

function getPriorityTone(priority) {
  if (priority >= 85) return "high";
  if (priority >= 70) return "medium";
  return "low";
}

function getAssignmentType(assignment) {
  if (assignment.status === "MILESTONE") return "milestone";
  if (assignment.fromJira) return "ops";
  return "planned";
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 960);

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < 960);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return mobile;
}

function SaveStatus({ status }) {
  if (!status) return null;

  const copy = {
    saving: "Saving changes",
    saved: "Saved",
    error: "Save failed",
  };

  return <span className={`save-status ${status}`}>{copy[status]}</span>;
}

function SummaryCard({ label, value, detail, tone = "default" }) {
  return (
    <div className={`summary-card ${tone}`}>
      <span className="summary-label">{label}</span>
      <strong>{value}</strong>
      <span className="summary-detail">{detail}</span>
    </div>
  );
}

function SectionCard({ eyebrow, title, action, children, className = "" }) {
  return (
    <section className={`panel ${className}`.trim()}>
      <div className="panel-head">
        <div>
          {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoHint({ label, text }) {
  return (
    <span className="info-hint" tabIndex={0}>
      {label}
      <span className="info-tooltip">{text}</span>
    </span>
  );
}

function PriorityPill({ item, onClick }) {
  return (
    <button className="priority-pill" onClick={() => onClick(item)} style={{ "--pill-accent": item.color }}>
      <span className="priority-pill-title">{item.title}</span>
      <span className="priority-pill-meta">
        {item.startKey ? fmtRange(item.startKey, item.endKey) : "Needs sizing"}
      </span>
    </button>
  );
}

function buildCalendarWeeks(anchorDate) {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  const monthEnd = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
  const gridStart = addDays(monthStart, -monthStart.getDay());
  const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay());
  const weeks = [];
  let currentWeek = [];

  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    currentWeek.push(new Date(cursor));
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  return weeks;
}

function MilestoneCalendar({ milestones, onEdit }) {
  const calendarMonths = [0, 1].map((offset) => new Date(TODAY.getFullYear(), TODAY.getMonth() + offset, 1));

  return (
    <div className="calendar-view">
      {calendarMonths.map((month) => {
        const weeks = buildCalendarWeeks(month);
        const monthKey = `${month.getFullYear()}-${month.getMonth()}`;

        return (
          <div key={monthKey} className="calendar-month">
            <div className="calendar-month-title">
              {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </div>
            <div className="calendar-grid calendar-weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <div key={label}>{label}</div>
              ))}
            </div>
            <div className="calendar-body">
              {weeks.map((week, index) => (
                <div key={`${monthKey}-${index}`} className="calendar-grid">
                  {week.map((day) => {
                    const dayKey = dateKey(day);
                    const dayMilestones = milestones.filter((item) => item.startKey === dayKey);
                    const outsideMonth = day.getMonth() !== month.getMonth();

                    return (
                      <div key={dayKey} className={`calendar-day ${outsideMonth ? "muted" : ""} ${dayKey === TODAY_KEY ? "today" : ""}`}>
                        <div className="calendar-day-number">{day.getDate()}</div>
                        <div className="calendar-events">
                          {dayMilestones.map((item) => (
                            <button
                              key={item.id}
                              className="calendar-event"
                              style={{ "--event-color": item.jiraKey || "#db2777" }}
                              onClick={() => onEdit(item)}
                            >
                              {item.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamLoadCard({ member, metrics, onAddPlanned }) {
  return (
    <div className="team-card">
      <div className="team-card-head">
        <div className="person-lockup">
          <div className="avatar" style={{ "--avatar-accent": member.color }}>
            {member.initials}
          </div>
          <div>
            <strong>{member.name}</strong>
            <span>{member.role}</span>
          </div>
        </div>
        <button className="ghost-button" onClick={() => onAddPlanned(member.id)}>
          Add planned item
        </button>
      </div>

      <div className="team-card-grid">
        <div>
          <span>Planned</span>
          <strong>{metrics.planned.length}</strong>
        </div>
        <div>
          <span>Ops active</span>
          <strong>{metrics.opsActive.length}</strong>
        </div>
        <div>
          <span>At risk</span>
          <strong>{metrics.atRisk.length}</strong>
        </div>
      </div>

      <div className="load-meter">
        <div className={`load-bar ${getPriorityTone(metrics.loadScore)}`} style={{ width: `${metrics.loadScore}%` }} />
      </div>
      <p className="load-caption">{metrics.loadLabel}</p>

      <div className="team-list-block">
        <span className="mini-label">Next up</span>
        {metrics.focus.length > 0 ? (
          <ul className="compact-list">
            {metrics.focus.map((item) => (
              <li key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.fromJira ? item.status || "Operational" : fmtRange(item.startKey, item.endKey)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-copy">No current focus items.</p>
        )}
      </div>
    </div>
  );
}

function TimelineRow({ item, days, onEdit }) {
  const startKey = item.startKey || item.dueDateKey || item.resolvedKey;
  const endKey = item.endKey || item.dueDateKey || item.resolvedKey;
  const startIndex = startKey ? days.findIndex((day) => dateKey(day) === startKey) : -1;
  const endIndex = endKey ? days.findIndex((day) => dateKey(day) === endKey) : startIndex;
  const safeStart = startIndex >= 0 ? startIndex : 0;
  const safeEnd = endIndex >= safeStart ? endIndex : safeStart;
  const span = Math.max(1, safeEnd - safeStart + 1);
  const type = getAssignmentType(item);

  return (
    <button className={`timeline-row ${type}`} onClick={() => onEdit(item)}>
      <div className="timeline-row-copy">
        <strong>{item.title}</strong>
        <span>
          {item.fromJira ? `${item.jiraKey || "Jira"}${item.status ? ` · ${item.status}` : ""}` : fmtRange(item.startKey, item.endKey)}
        </span>
        {item.fromJira ? (
          <div className="timeline-row-submeta">
            <span>{item.isDone && item.resolvedKey ? `Completed ${fmtDate(item.resolvedKey)}` : item.dueDateKey ? `Due ${fmtDate(item.dueDateKey)}` : "No due date"}</span>
            {item.jiraKey ? (
              <a
                href={`${JIRA_BASE}/${item.jiraKey}`}
                target="_blank"
                rel="noreferrer"
                className="timeline-link"
                onClick={(event) => event.stopPropagation()}
              >
                Open in Jira
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="timeline-track">
        <div className="timeline-bar" style={{ left: `${(safeStart / days.length) * 100}%`, width: `${(span / days.length) * 100}%` }} />
      </div>
    </button>
  );
}

function MemberRoadmap({ member, items, days, onEditTask }) {
  const sortedItems = [...items].sort((a, b) => {
    const aKey = a.startKey || a.dueDateKey || a.resolvedKey || "9999-12-31";
    const bKey = b.startKey || b.dueDateKey || b.resolvedKey || "9999-12-31";
    return aKey.localeCompare(bKey);
  });

  const planned = sortedItems.filter((item) => !item.fromJira && item.status !== "MILESTONE");
  const ops = sortedItems.filter((item) => item.fromJira && !item.isDone);
  const done = sortedItems.filter((item) => item.fromJira && item.isDone);

  return (
    <div className="member-roadmap">
      <div className="member-roadmap-head">
        <div className="person-lockup">
          <div className="avatar" style={{ "--avatar-accent": member.color }}>
            {member.initials}
          </div>
          <div>
            <strong>{member.name}</strong>
            <span>{member.role}</span>
          </div>
        </div>
        <div className="member-roadmap-metrics">
          <span>{planned.length} project</span>
          <span>{ops.length} ops active</span>
          <span>{done.length} completed</span>
        </div>
      </div>

      {sortedItems.length ? (
        <div className="member-roadmap-rows">
          {planned.length ? (
            <div className="roadmap-lane">
              <div className="roadmap-lane-label">
                <strong>Project work</strong>
                <span>Manual items tied to delivery</span>
              </div>
              <div className="roadmap-lane-items">
                {planned.map((item) => (
                  <TimelineRow key={item.id} item={item} days={days} onEdit={onEditTask} />
                ))}
              </div>
            </div>
          ) : null}

          {ops.length ? (
            <div className="roadmap-lane ops-lane">
              <div className="roadmap-lane-label">
                <strong>Operational pull</strong>
              </div>
              <div className="roadmap-lane-items">
                {ops.map((item) => (
                  <TimelineRow key={item.id} item={item} days={days} onEdit={onEditTask} />
                ))}
              </div>
            </div>
          ) : null}

          {done.length ? (
            <div className="roadmap-lane done-lane">
              <div className="roadmap-lane-label">
                <strong>Completed ops</strong>
                <span>Recently resolved Jira work</span>
              </div>
              <div className="roadmap-lane-items">
                {done.slice(0, 3).map((item) => (
                  <TimelineRow key={item.id} item={item} days={days} onEdit={onEditTask} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="empty-copy">No project or operational work is assigned to this person in the 60-day window.</p>
      )}
    </div>
  );
}

function TaskTable({ title, items, emptyCopy, onEdit }) {
  return (
    <div className="task-table">
      <div className="task-table-head">
        <strong>{title}</strong>
        <span>{items.length}</span>
      </div>
      {items.length ? (
        <div className="task-table-list">
          {items.map((item) => {
            const member = TEAM_MEMBERS.find((person) => person.id === item.memberId);
            const overdue = item.dueDateKey && !item.isDone && item.dueDateKey < TODAY_KEY;

            return (
              <button key={item.id} className={`task-row ${overdue ? "overdue" : ""}`} onClick={() => onEdit(item)}>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {member ? member.name : "Team-wide"}
                    {item.fromJira && item.status ? ` · ${item.status}` : ""}
                  </span>
                </div>
                <div className="task-row-meta">
                  {item.fromJira ? (
                    <span>{item.jiraKey || item.status}</span>
                  ) : (
                    <span>{fmtRange(item.startKey, item.endKey)}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="empty-copy">{emptyCopy}</p>
      )}
    </div>
  );
}

export default function App() {
  const isMobile = useIsMobile();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [viewMode, setViewMode] = useState("all");
  const [showDone, setShowDone] = useState(true);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMilestoneModal, setShowMilestoneModal] = useState(false);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [editingMilestone, setEditingMilestone] = useState(null);
  const [editingPriority, setEditingPriority] = useState(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    memberId: 1,
    startKey: TODAY_KEY,
    endKey: dateKey(addDays(TODAY, 4)),
    fromJira: false,
    dueDateKey: null,
  });
  const [milestoneForm, setMilestoneForm] = useState({
    title: "",
    dateKey: TODAY_KEY,
    color: MILESTONE_COLORS[0],
  });
  const [priorityForm, setPriorityForm] = useState({
    title: "",
    startKey: "",
    endKey: "",
    color: PRIORITY_COLORS[0],
  });
  const [nextPriorities, setNextPriorities] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const nextId = useRef(300);
  const saveTimer = useRef(null);
  const timelineDays = useMemo(() => buildTimelineDays(), []);
  const timelineMonths = useMemo(() => {
    const groups = [];
    timelineDays.forEach((day) => {
      const key = `${day.getFullYear()}-${day.getMonth()}`;
      const label = day.toLocaleDateString("en-US", { month: "short" });
      const existing = groups[groups.length - 1];
      if (existing && existing.key === key) {
        existing.count += 1;
      } else {
        groups.push({ key, label, count: 1 });
      }
    });
    return groups;
  }, [timelineDays]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPriorities));
    } catch {
      // Ignore localStorage failures in private mode or locked browsers.
    }
  }, [nextPriorities]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        const assignmentsResponse = await fetch("/api/assignments");
        const stored = await assignmentsResponse.json();

        const savedAssignments = Array.isArray(stored)
          ? stored.map((row) => ({
              id: row.id,
              title: row.title,
              memberId: row.member_id,
              startKey: row.start_key,
              endKey: row.end_key,
              fromJira: row.from_jira,
              jiraKey: row.jira_key,
              status: row.status,
              dueDateKey: row.due_date_key,
              resolvedKey: row.resolved_key,
              isDone: row.is_done,
            }))
          : [];

        const [activeResponse, doneResponse] = await Promise.all([
          fetch(
            `/api/jira?jql=${encodeURIComponent(
              'status in ("Ready to Work","In Progress","Testing","Ready for Release","Selected for Development") AND assignee is not EMPTY ORDER BY duedate ASC'
            )}`
          ),
          fetch(
            `/api/jira?jql=${encodeURIComponent(
              'status in ("Done","Deployed") AND assignee is not EMPTY AND resolutiondate >= -30d ORDER BY resolutiondate DESC'
            )}`
          ),
        ]);

        const activeData = await activeResponse.json();
        const doneData = await doneResponse.json();

        const mapIssue = (issue, isDone) => {
          const { summary, assignee, duedate } = issue.fields;
          const member = TEAM_MEMBERS.find(
            (person) =>
              assignee && person.name.toLowerCase().includes(assignee.displayName?.split(" ")[0].toLowerCase())
          );

          if (!member) return null;

          const dueDateKey = duedate ? dateKey(new Date(`${duedate}T12:00:00`)) : null;
          const resolved = issue.fields.transitionDate || issue.fields.resolutiondate;
          const resolvedKey = resolved ? dateKey(new Date(resolved)) : null;

          return {
            id: `jira-${issue.id}`,
            title: summary,
            memberId: member.id,
            startKey: null,
            endKey: null,
            fromJira: true,
            jiraKey: issue.key,
            status: issue.fields.status?.name,
            dueDateKey,
            resolvedKey,
            isDone,
          };
        };

        const jiraAssignments = [
          ...(activeData.issues || []).map((issue) => mapIssue(issue, false)),
          ...(doneData.issues || []).map((issue) => mapIssue(issue, true)),
        ].filter(Boolean);

        const merged = [...savedAssignments.filter((item) => !item.fromJira), ...jiraAssignments];

        if (!cancelled) {
          setAssignments(merged);
          await persistAssignments(merged, setSaveStatus);
        }
      } catch (error) {
        console.error("Initial load failed", error);
        if (!cancelled) setSyncStatus({ type: "error", message: "Unable to load Jira and saved assignments." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleAssignments = useMemo(() => {
    return assignments.filter((item) => {
      if (item.status === "MILESTONE") return true;
      if (!showDone && item.isDone) return false;
      if (viewMode === "planned") return !item.fromJira;
      if (viewMode === "ops") return item.fromJira;
      return true;
    });
  }, [assignments, showDone, viewMode]);

  const milestones = useMemo(
    () => assignments.filter((item) => item.status === "MILESTONE").sort((a, b) => a.startKey.localeCompare(b.startKey)),
    [assignments]
  );

  const plannedItems = useMemo(
    () => visibleAssignments.filter((item) => !item.fromJira && item.status !== "MILESTONE"),
    [visibleAssignments]
  );
  const opsItems = useMemo(() => visibleAssignments.filter((item) => item.fromJira && !item.isDone), [visibleAssignments]);
  const activelyInProgressOps = useMemo(
    () =>
      opsItems
        .filter((item) =>
          ["In Progress", "Testing", "Ready for Release", "Selected for Development", "Ready to Work"].includes(item.status || "")
        )
        .sort((a, b) => {
          const aKey = a.dueDateKey || "9999-12-31";
          const bKey = b.dueDateKey || "9999-12-31";
          return aKey.localeCompare(bKey);
        }),
    [opsItems]
  );
  const doneRecently = useMemo(() => assignments.filter((item) => item.fromJira && item.isDone), [assignments]);
  const overdueOps = useMemo(
    () => assignments.filter((item) => item.fromJira && !item.isDone && item.dueDateKey && item.dueDateKey < TODAY_KEY),
    [assignments]
  );

  const teamMetrics = useMemo(() => {
    return TEAM_MEMBERS.map((member) => {
      const memberAssignments = assignments.filter((item) => item.memberId === member.id && item.status !== "MILESTONE");
      const planned = memberAssignments.filter((item) => !item.fromJira && !item.isDone);
      const opsActive = memberAssignments.filter((item) => item.fromJira && !item.isDone);
      const atRisk = opsActive.filter((item) => item.dueDateKey && item.dueDateKey < TODAY_KEY);
      const focus = [...planned, ...opsActive]
        .sort((a, b) => {
          const aKey = a.startKey || a.dueDateKey || "9999-12-31";
          const bKey = b.startKey || b.dueDateKey || "9999-12-31";
          return aKey.localeCompare(bKey);
        })
        .slice(0, 3);

      const loadScore = Math.min(100, planned.length * 18 + opsActive.length * 16 + atRisk.length * 18);
      const loadLabel =
        loadScore >= 85 ? "Heavy concentration of work. Review scope or coverage." : loadScore >= 70 ? "Busy but manageable." : "Capacity looks healthy.";

      return { member, planned, opsActive, atRisk, focus, loadScore, loadLabel };
    });
  }, [assignments]);

  const summary = useMemo(() => {
    const activeOps = assignments.filter((item) => item.fromJira && !item.isDone).length;
    const planned = assignments.filter((item) => !item.fromJira && item.status !== "MILESTONE").length;
    const done = assignments.filter((item) => item.fromJira && item.isDone).length;
    const unscheduledPriorities = nextPriorities.filter((item) => !item.startKey).length;

    return {
      activeOps,
      planned,
      done,
      unscheduledPriorities,
    };
  }, [assignments, nextPriorities]);

  function updateAssignments(updater) {
    setAssignments((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => persistAssignments(next, setSaveStatus), 500);
      return next;
    });
  }

  function openNewTask(memberId = 1) {
    setEditingAssignment(null);
    setTaskForm({
      title: "",
      memberId,
      startKey: TODAY_KEY,
      endKey: dateKey(addDays(TODAY, 4)),
      fromJira: false,
      dueDateKey: null,
    });
    setShowTaskModal(true);
  }

  function openTask(item) {
    setEditingAssignment(item);
    setTaskForm({
      title: item.title,
      memberId: item.memberId,
      startKey: item.startKey || TODAY_KEY,
      endKey: item.endKey || item.startKey || TODAY_KEY,
      fromJira: item.fromJira,
      dueDateKey: item.dueDateKey || null,
    });
    setShowTaskModal(true);
  }

  function saveTask() {
    if (!taskForm.title.trim()) return;
    if (!taskForm.fromJira && taskForm.endKey < taskForm.startKey) return;

    const payload = {
      ...editingAssignment,
      title: taskForm.title.trim(),
      memberId: Number(taskForm.memberId),
      startKey: taskForm.fromJira ? null : taskForm.startKey,
      endKey: taskForm.fromJira ? null : taskForm.endKey,
      dueDateKey: taskForm.fromJira ? taskForm.dueDateKey : null,
      fromJira: taskForm.fromJira,
    };

    if (editingAssignment) {
      updateAssignments((current) => current.map((item) => (item.id === editingAssignment.id ? payload : item)));
    } else {
      updateAssignments((current) => [
        ...current,
        {
          id: `manual-${nextId.current++}-${Date.now()}`,
          title: payload.title,
          memberId: payload.memberId,
          startKey: payload.startKey,
          endKey: payload.endKey,
          fromJira: false,
          jiraKey: null,
          status: null,
          dueDateKey: null,
          resolvedKey: null,
          isDone: false,
        },
      ]);
    }

    setShowTaskModal(false);
  }

  function deleteTask(id) {
    updateAssignments((current) => current.filter((item) => item.id !== id));
    setShowTaskModal(false);
  }

  function openNewMilestone() {
    setEditingMilestone(null);
    setMilestoneForm({ title: "", dateKey: TODAY_KEY, color: MILESTONE_COLORS[0] });
    setShowMilestoneModal(true);
  }

  function openMilestone(item) {
    setEditingMilestone(item);
    setMilestoneForm({ title: item.title, dateKey: item.startKey, color: item.jiraKey || MILESTONE_COLORS[0] });
    setShowMilestoneModal(true);
  }

  function saveMilestone() {
    if (!milestoneForm.title.trim()) return;

    const payload = {
      id: editingMilestone ? editingMilestone.id : `milestone-${nextId.current++}-${Date.now()}`,
      title: milestoneForm.title.trim(),
      memberId: null,
      startKey: milestoneForm.dateKey,
      endKey: milestoneForm.dateKey,
      fromJira: false,
      jiraKey: milestoneForm.color,
      status: "MILESTONE",
      dueDateKey: null,
      resolvedKey: null,
      isDone: false,
    };

    if (editingMilestone) {
      updateAssignments((current) => current.map((item) => (item.id === editingMilestone.id ? payload : item)));
    } else {
      updateAssignments((current) => [...current, payload]);
    }

    setShowMilestoneModal(false);
  }

  function deleteMilestone(id) {
    updateAssignments((current) => current.filter((item) => item.id !== id));
    setShowMilestoneModal(false);
  }

  function openNewPriority() {
    setEditingPriority(null);
    setPriorityForm({ title: "", startKey: "", endKey: "", color: PRIORITY_COLORS[0] });
    setShowPriorityModal(true);
  }

  function openPriority(item) {
    setEditingPriority(item);
    setPriorityForm({
      title: item.title,
      startKey: item.startKey || "",
      endKey: item.endKey || "",
      color: item.color || PRIORITY_COLORS[0],
    });
    setShowPriorityModal(true);
  }

  function savePriority() {
    if (!priorityForm.title.trim()) return;

    const payload = {
      id: editingPriority ? editingPriority.id : `priority-${Date.now()}`,
      title: priorityForm.title.trim(),
      startKey: priorityForm.startKey || null,
      endKey: priorityForm.endKey || priorityForm.startKey || null,
      color: priorityForm.color,
    };

    if (editingPriority) {
      setNextPriorities((current) => current.map((item) => (item.id === editingPriority.id ? payload : item)));
    } else {
      setNextPriorities((current) => [...current, payload]);
    }

    setShowPriorityModal(false);
  }

  function deletePriority(id) {
    setNextPriorities((current) => current.filter((item) => item.id !== id));
    setShowPriorityModal(false);
  }

  async function syncFromJira() {
    setSyncing(true);
    setSyncStatus(null);

    try {
      const [activeResponse, doneResponse] = await Promise.all([
        fetch(
          `/api/jira?jql=${encodeURIComponent(
            'status in ("Ready to Work","In Progress","Testing","Ready for Release","Selected for Development") AND assignee is not EMPTY ORDER BY duedate ASC'
          )}`
        ),
        fetch(
          `/api/jira?jql=${encodeURIComponent(
            'status in ("Done","Deployed") AND assignee is not EMPTY AND resolutiondate >= -30d ORDER BY resolutiondate DESC'
          )}`
        ),
      ]);

      const activeData = await activeResponse.json();
      const doneData = await doneResponse.json();

      const mapIssue = (issue, isDone) => {
        const { summary, assignee, duedate, resolutiondate } = issue.fields;
        const member = TEAM_MEMBERS.find(
          (person) =>
            assignee && person.name.toLowerCase().includes(assignee.displayName?.split(" ")[0].toLowerCase())
        );

        if (!member) return null;

        return {
          id: `jira-${issue.id}`,
          title: summary,
          memberId: member.id,
          startKey: null,
          endKey: null,
          fromJira: true,
          jiraKey: issue.key,
          status: issue.fields.status?.name,
          dueDateKey: duedate ? dateKey(new Date(`${duedate}T12:00:00`)) : null,
          resolvedKey: resolutiondate ? dateKey(new Date(resolutiondate)) : null,
          isDone,
        };
      };

      const merged = [
        ...assignments.filter((item) => !item.fromJira),
        ...(activeData.issues || []).map((issue) => mapIssue(issue, false)).filter(Boolean),
        ...(doneData.issues || []).map((issue) => mapIssue(issue, true)).filter(Boolean),
      ];

      updateAssignments(merged);
      setSyncStatus({
        type: "success",
        message: `Synced ${(activeData.issues || []).length} active and ${(doneData.issues || []).length} recently completed Jira tickets.`,
      });
    } catch (error) {
      console.error("Jira sync failed", error);
      setSyncStatus({ type: "error", message: "Sync failed. Check Jira connection and try again." });
    } finally {
      setSyncing(false);
    }
  }

  const initiatives = useMemo(() => {
    const scheduled = [...nextPriorities].sort((a, b) => {
      const aKey = a.startKey || "9999-12-31";
      const bKey = b.startKey || "9999-12-31";
      return aKey.localeCompare(bKey);
    });

    return scheduled.slice(0, isMobile ? 3 : 4);
  }, [nextPriorities, isMobile]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <span className="hero-badge">Team Planner</span>
        </div>

        <div className="hero-actions">
          <div className="hero-mini-board">
            <div>
              <span>Projects in motion</span>
              <strong>{summary.planned}</strong>
            </div>
            <div>
              <span>Ops in motion</span>
              <strong>{summary.activeOps}</strong>
            </div>
            <div>
              <span>Upcoming priorities</span>
              <strong>{nextPriorities.length}</strong>
            </div>
          </div>
          <SaveStatus status={saveStatus} />
          <button className="secondary-button" onClick={() => setShowDone((current) => !current)}>
            {showDone ? "Hide completed" : "Show completed"}
          </button>
          <button className="secondary-button" onClick={openNewMilestone}>
            Add milestone
          </button>
          <button className="primary-button" onClick={() => openNewTask(1)}>
            Add planned item
          </button>
          <button className="sync-button" onClick={syncFromJira} disabled={syncing}>
            {syncing ? "Syncing Jira..." : "Sync Jira"}
          </button>
        </div>
      </header>

      {syncStatus ? <div className={`status-banner ${syncStatus.type}`}>{syncStatus.message}</div> : null}

      <div className="summary-grid">
        <SummaryCard label="Operational work" value={summary.activeOps} detail="Active Jira tickets in flight" tone="blue" />
        <SummaryCard label="Planned delivery" value={summary.planned} detail="Manual project work on the roadmap" tone="orange" />
        <SummaryCard label="Recently finished" value={summary.done} detail="Done or deployed in the last 30 days" tone="green" />
        <SummaryCard
          label="Needs sizing"
          value={summary.unscheduledPriorities}
          detail="Upcoming priorities without dates yet"
          tone="purple"
        />
      </div>

      <div className="control-row">
        <div className="segmented-control">
          <button className={viewMode === "all" ? "active" : ""} onClick={() => setViewMode("all")}>
            All work
          </button>
          <button className={viewMode === "planned" ? "active" : ""} onClick={() => setViewMode("planned")}>
            Project level
          </button>
          <button className={viewMode === "ops" ? "active" : ""} onClick={() => setViewMode("ops")}>
            Operational only
          </button>
        </div>
        <div className="date-chip">
          <span>Today</span>
          <strong>{fmtDate(TODAY_KEY, { month: "long", day: "numeric", year: "numeric" })}</strong>
        </div>
      </div>

      {loading ? (
        <section className="loading-panel">
          <div className="spinner" />
          <p>Loading team work, saved plans, and Jira sync data...</p>
        </section>
      ) : (
        <main className="dashboard-grid">
          <SectionCard
            eyebrow="Upcoming priorities"
            title="What management should line up next"
            action={
              <button className="ghost-button" onClick={openNewPriority}>
                Add priority
              </button>
            }
          >
            {initiatives.length ? (
              <div className="priority-list">
                {initiatives.map((item) => (
                  <PriorityPill key={item.id} item={item} onClick={openPriority} />
                ))}
              </div>
            ) : (
              <p className="empty-copy">Add upcoming priorities so the team can distinguish current work from what is coming next.</p>
            )}
          </SectionCard>

          <SectionCard
            eyebrow="Management signals"
            title={
              <>
                Where attention is needed now{" "}
                <InfoHint
                  label="?"
                  text='Risk means either overdue Jira work or a teammate carrying a heavy mix of active work that could cause slippage.'
                />
              </>
            }
          >
            <div className="signals-grid">
              <div className="signal-card warn">
                <span>Operational risk</span>
                <strong>{overdueOps.length}</strong>
                <p>{overdueOps.length ? "Jira tickets are overdue and may need intervention." : "No overdue Jira work right now."}</p>
              </div>
              <div className="signal-card calm">
                <span>Milestones</span>
                <strong>{milestones.length}</strong>
                <p>{milestones.length ? "Key dates are being tracked on the calendar." : "No milestone markers have been added yet."}</p>
              </div>
              <div className="signal-card">
                <span>Next priorities</span>
                <strong>{nextPriorities.length}</strong>
                <p>{nextPriorities.length ? "Upcoming items are captured for handoff and planning." : "No upcoming priorities are documented yet."}</p>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            eyebrow="Team management"
            title={
              <>
                Capacity and focus by person{" "}
                <InfoHint
                  label="?"
                  text='Risk on each person card is driven by overdue Jira tickets plus the number of active planned and operational items assigned to them.'
                />
              </>
            }
            className="wide"
          >
            <div className="team-grid">
              {teamMetrics.map((metrics) => (
                <TeamLoadCard key={metrics.member.id} member={metrics.member} metrics={metrics} onAddPlanned={openNewTask} />
              ))}
            </div>
          </SectionCard>

          <SectionCard eyebrow="Project delivery" title="Planned project work">
            <TaskTable
              title="Planned items"
              items={plannedItems}
              emptyCopy="No planned project items are visible in this view."
              onEdit={openTask}
            />
          </SectionCard>

          <SectionCard eyebrow="Operational execution" title="Active Jira work in progress">
            <TaskTable
              title="In-progress operational tickets"
              items={activelyInProgressOps}
              emptyCopy="No Jira tickets are currently in an active in-progress state."
              onEdit={openTask}
            />
          </SectionCard>

          <SectionCard eyebrow="Completed recently" title="Last 30 days from Jira">
            <TaskTable
              title="Done or deployed"
              items={doneRecently.slice(0, 8)}
              emptyCopy="No completed Jira tickets are available right now."
              onEdit={openTask}
            />
          </SectionCard>

          <SectionCard eyebrow="Milestones" title="Dates the team is working toward">
            {milestones.length ? (
              <MilestoneCalendar milestones={milestones} onEdit={openMilestone} />
            ) : (
              <p className="empty-copy">Add milestone markers so project delivery and operational work share the same timeline context.</p>
            )}
          </SectionCard>

          <SectionCard eyebrow="Gantt view" title="60-day delivery distraction map" className="wide">
            <div className="gantt-meta">
              <div className="gantt-legend">
                <span><i className="legend-chip planned" /> Planned</span>
                <span><i className="legend-chip ops" /> Operational</span>
                <span><i className="legend-chip milestone" /> Milestone</span>
              </div>
              <p>Grouped by team member so you can see where operational work is competing with project delivery and when those distractions land.</p>
            </div>
            <div className="timeline-months">
              {timelineMonths.map((month) => (
                <div key={month.key} style={{ gridColumn: `span ${month.count}` }}>
                  {month.label}
                </div>
              ))}
            </div>
            <div className="timeline-header">
              {timelineDays.map((day) => (
                <div key={dateKey(day)} className={`timeline-day ${dateKey(day) === TODAY_KEY ? "today" : ""}`}>
                  <span>{day.toLocaleDateString("en-US", { month: "short" })}</span>
                  <strong>{day.getDate()}</strong>
                </div>
              ))}
            </div>
            <div className="timeline-body member-timeline-body">
              {TEAM_MEMBERS.map((member) => {
                const memberItems = assignments.filter((item) => item.memberId === member.id && (showDone || !item.isDone));
                return (
                  <MemberRoadmap
                    key={member.id}
                    member={member}
                    items={memberItems}
                    days={timelineDays}
                    onEditTask={openTask}
                  />
                );
              })}
              {milestones.length ? (
                <div className="member-roadmap milestone-roadmap">
                  <div className="member-roadmap-head">
                    <div>
                      <strong>Shared milestones</strong>
                      <span>Team-wide checkpoints affecting delivery</span>
                    </div>
                  </div>
                  <div className="member-roadmap-rows">
                    <div className="roadmap-lane">
                      <div className="roadmap-lane-label">
                        <strong>Milestones</strong>
                        <span>Delivery anchors across the team</span>
                      </div>
                      <div className="roadmap-lane-items">
                        {milestones.map((item) => (
                          <TimelineRow key={item.id} item={item} days={timelineDays} onEdit={openMilestone} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </SectionCard>
        </main>
      )}

      {showTaskModal ? (
        <div className="modal-backdrop" onClick={() => setShowTaskModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">{editingAssignment?.fromJira ? "Operational item" : "Planned item"}</span>
                <h3>{editingAssignment ? "Edit item" : "New planned item"}</h3>
              </div>
              <button className="icon-button" onClick={() => setShowTaskModal(false)}>
                x
              </button>
            </div>

            <label>
              <span>Title</span>
              <input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} />
            </label>

            <label>
              <span>Owner</span>
              <select
                value={taskForm.memberId}
                onChange={(event) => setTaskForm((current) => ({ ...current, memberId: Number(event.target.value) }))}
              >
                {TEAM_MEMBERS.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} - {member.role}
                  </option>
                ))}
              </select>
            </label>

            {!editingAssignment?.fromJira ? (
              <div className="modal-grid">
                <label>
                  <span>Start date</span>
                  <input
                    type="date"
                    value={taskForm.startKey}
                    onChange={(event) => setTaskForm((current) => ({ ...current, startKey: event.target.value }))}
                  />
                </label>
                <label>
                  <span>End date</span>
                  <input
                    type="date"
                    value={taskForm.endKey}
                    min={taskForm.startKey}
                    onChange={(event) => setTaskForm((current) => ({ ...current, endKey: event.target.value }))}
                  />
                </label>
              </div>
            ) : null}

            {editingAssignment?.fromJira && editingAssignment?.jiraKey ? (
              <a className="link-button" href={`${JIRA_BASE}/${editingAssignment.jiraKey}`} target="_blank" rel="noreferrer">
                Open {editingAssignment.jiraKey} in Jira
              </a>
            ) : null}

            <div className="modal-actions">
              {editingAssignment ? (
                <button className="danger-button" onClick={() => deleteTask(editingAssignment.id)}>
                  Delete
                </button>
              ) : null}
              <button className="primary-button" onClick={saveTask}>
                {editingAssignment ? "Save changes" : "Add item"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showMilestoneModal ? (
        <div className="modal-backdrop" onClick={() => setShowMilestoneModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Milestone</span>
                <h3>{editingMilestone ? "Edit milestone" : "New milestone"}</h3>
              </div>
              <button className="icon-button" onClick={() => setShowMilestoneModal(false)}>
                x
              </button>
            </div>

            <label>
              <span>Milestone name</span>
              <input
                value={milestoneForm.title}
                onChange={(event) => setMilestoneForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <label>
              <span>Date</span>
              <input
                type="date"
                value={milestoneForm.dateKey}
                onChange={(event) => setMilestoneForm((current) => ({ ...current, dateKey: event.target.value }))}
              />
            </label>

            <div>
              <span className="field-label">Category color</span>
              <div className="color-palette">
                {MILESTONE_COLORS.map((color) => (
                  <button
                    key={color}
                    className={milestoneForm.color === color ? "color-swatch active" : "color-swatch"}
                    style={{ background: color }}
                    onClick={() => setMilestoneForm((current) => ({ ...current, color }))}
                  />
                ))}
              </div>
            </div>

            <div className="modal-actions">
              {editingMilestone ? (
                <button className="danger-button" onClick={() => deleteMilestone(editingMilestone.id)}>
                  Delete
                </button>
              ) : null}
              <button className="primary-button" onClick={saveMilestone}>
                {editingMilestone ? "Save milestone" : "Add milestone"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPriorityModal ? (
        <div className="modal-backdrop" onClick={() => setShowPriorityModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <span className="eyebrow">Upcoming priority</span>
                <h3>{editingPriority ? "Edit priority" : "New priority"}</h3>
              </div>
              <button className="icon-button" onClick={() => setShowPriorityModal(false)}>
                x
              </button>
            </div>

            <label>
              <span>Title</span>
              <input
                value={priorityForm.title}
                onChange={(event) => setPriorityForm((current) => ({ ...current, title: event.target.value }))}
              />
            </label>

            <div className="modal-grid">
              <label>
                <span>Start date</span>
                <input
                  type="date"
                  value={priorityForm.startKey}
                  onChange={(event) => setPriorityForm((current) => ({ ...current, startKey: event.target.value }))}
                />
              </label>
              <label>
                <span>End date</span>
                <input
                  type="date"
                  value={priorityForm.endKey}
                  min={priorityForm.startKey}
                  onChange={(event) => setPriorityForm((current) => ({ ...current, endKey: event.target.value }))}
                />
              </label>
            </div>

            <div>
              <span className="field-label">Color tag</span>
              <div className="color-palette">
                {PRIORITY_COLORS.map((color) => (
                  <button
                    key={color}
                    className={priorityForm.color === color ? "color-swatch active" : "color-swatch"}
                    style={{ background: color }}
                    onClick={() => setPriorityForm((current) => ({ ...current, color }))}
                  />
                ))}
              </div>
            </div>

            <div className="modal-actions">
              {editingPriority ? (
                <button className="danger-button" onClick={() => deletePriority(editingPriority.id)}>
                  Delete
                </button>
              ) : null}
              <button className="primary-button" onClick={savePriority}>
                {editingPriority ? "Save priority" : "Add priority"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function persistAssignments(list, setSaveStatus) {
  setSaveStatus("saving");

  try {
    const response = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments: list }),
    });

    if (!response.ok) throw new Error("Save failed");

    setSaveStatus("saved");
    window.setTimeout(() => setSaveStatus(null), 2000);
  } catch (error) {
    console.error("Persist failed", error);
    setSaveStatus("error");
  }
}
