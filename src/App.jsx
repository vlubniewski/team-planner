import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const TEAM_MEMBERS = [
  { id: 1, name: "Ryan Geraghty", role: "Director, Software Development", color: "#2563eb", initials: "RG" },
  { id: 2, name: "Michael Santilli", role: "Sr. Web Developer", color: "#0f766e", initials: "MS" },
  { id: 3, name: "John Kaeser", role: "Sr. Developer", color: "#c2410c", initials: "JK" },
  { id: 4, name: "Jason Moore", role: "Web Developer", color: "#7c3aed", initials: "JM" },
];

const JIRA_BASE = "https://hmpglobal.atlassian.net/browse";
const STORAGE_KEY = "nextPriorities";
const MILESTONE_COLORS = ["#d97706", "#4f46e5", "#db2777", "#059669", "#dc2626", "#0057b8"];
const PRIORITY_COLORS = ["#2563eb", "#0f766e", "#c2410c", "#7c3aed", "#be185d", "#374151"];
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TODAY_KEY = dateKey(TODAY);
const ACTIVE_STATUSES = ["Ready to Work", "Selected for Development", "In Progress", "Testing", "Ready for Release"];

function getRangeBounds(rangeKey) {
  const year = TODAY.getFullYear();
  if (rangeKey === "30d") {
    return { start: dateKey(addDays(TODAY, -29)), end: TODAY_KEY, label: "Last 30 days" };
  }
  if (rangeKey === "ytd") {
    return { start: `${year}-01-01`, end: TODAY_KEY, label: "Year to date" };
  }
  const quarterMap = {
    q1: { start: `${year}-01-01`, end: `${year}-03-31`, label: `Q1 ${year}` },
    q2: { start: `${year}-04-01`, end: `${year}-06-30`, label: `Q2 ${year}` },
    q3: { start: `${year}-07-01`, end: `${year}-09-30`, label: `Q3 ${year}` },
    q4: { start: `${year}-10-01`, end: `${year}-12-31`, label: `Q4 ${year}` },
  };
  return quarterMap[rangeKey] || { start: dateKey(addDays(TODAY, -29)), end: TODAY_KEY, label: "Last 30 days" };
}

function isWithinRange(key, start, end) {
  if (!key) return false;
  return key >= start && key <= end;
}

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
  if (!startKey) return "No schedule";
  if (!endKey || startKey === endKey) return fmtDate(startKey);
  return `${fmtDate(startKey)} - ${fmtDate(endKey)}`;
}

function diffDays(startKey, endKey) {
  if (!startKey || !endKey) return 0;
  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
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
  const copy = { saving: "Saving", saved: "Saved", error: "Save failed" };
  return <span className={`save-status ${status}`}>{copy[status]}</span>;
}

function Section({ eyebrow, title, action, children, wide = false }) {
  return (
    <section className={`pm-section ${wide ? "wide" : ""}`}>
      <div className="pm-section-head">
        <div>
          <div className="section-eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, detail, tone = "default" }) {
  return (
    <div className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function FilterChip({ label, active, onClick }) {
  return (
    <button className={`filter-chip ${active ? "active" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
}

function InitiativeCard({ item, owner, opsCount, onEdit }) {
  return (
    <button className="initiative-card" onClick={() => onEdit(item)}>
      <div className="initiative-topline">
        <span className="initiative-kind">Project</span>
        <span className="initiative-owner">{owner?.name || "Unassigned"}</span>
      </div>
      <strong>{item.title}</strong>
      <p>{fmtRange(item.startKey, item.endKey)}</p>
      <div className="initiative-meta">
        <span>{diffDays(item.startKey, item.endKey)} day duration</span>
        <span>{opsCount} ops distractions</span>
      </div>
    </button>
  );
}

function TeamCard({ member, projects, opsItems, onEditTask }) {
  const [open, setOpen] = useState(member.id === 1);
  const activeOps = opsItems
    .filter((item) => !item.isDone)
    .sort((a, b) => {
      const aKey = a.dueDateKey || "9999-12-31";
      const bKey = b.dueDateKey || "9999-12-31";
      return aKey.localeCompare(bKey);
    });
  const atRisk = activeOps.filter((item) => item.dueDateKey && item.dueDateKey < TODAY_KEY);

  return (
    <div className={`team-card assignee-card ${open ? "open" : ""}`}>
      <button className="team-card-head assignee-head" onClick={() => setOpen((current) => !current)}>
        <div className="person-lockup">
          <span className="assignee-caret">{open ? "▾" : "▸"}</span>
          <div className="avatar" style={{ "--avatar-accent": member.color }}>
            {member.initials}
          </div>
          <div>
            <strong>{member.name}</strong>
            <span>{member.role}</span>
          </div>
        </div>
        <div className="team-metrics">
          <span>{projects.length} project</span>
          <span>{activeOps.length} ops</span>
          <span>{atRisk.length} at risk</span>
        </div>
      </button>

      {open ? (
        <div className="assignee-body">
          <div className="project-block">
            <div className="team-column-head">
              <strong>Project block</strong>
              <span>Project-level work owned by this developer</span>
            </div>
            {projects.length ? (
              <div className="team-list">
                {projects.map((item) => (
                  <button key={item.id} className="team-list-item project-block-item" onClick={() => onEditTask(item)}>
                    <strong>{item.title}</strong>
                    <span>{fmtRange(item.startKey, item.endKey)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No project-level delivery assigned.</p>
            )}
          </div>

          <div className="ops-block">
            <div className="team-column-head">
              <strong>Operational items</strong>
              <span>Sorted in chronological due date order</span>
            </div>
            {activeOps.length ? (
              <div className="team-list">
                {activeOps.map((item) => (
                  <button key={item.id} className="team-list-item ops" onClick={() => onEditTask(item)}>
                    <strong>{item.title}</strong>
                    <span>
                      {item.status || "Operational"}
                      {item.dueDateKey ? ` · Due ${fmtDate(item.dueDateKey)}` : " · No due date"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No operational work selected in current filters.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function JiraBoard({ items, onEdit }) {
  const byStatus = ACTIVE_STATUSES.map((status) => ({
    status,
    items: items.filter((item) => item.status === status),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="jira-board">
      {byStatus.map((group) => (
        <div key={group.status} className="jira-column">
          <div className="jira-column-head">
            <strong>{group.status}</strong>
            <span>{group.items.length}</span>
          </div>
          <div className="jira-column-body">
            {group.items.map((item) => (
              <button key={item.id} className="jira-ticket" onClick={() => onEdit(item)}>
                <strong>{item.title}</strong>
                <span>{TEAM_MEMBERS.find((member) => member.id === item.memberId)?.name || "Team"}</span>
                <div className="jira-ticket-meta">
                  <span>{item.jiraKey}</span>
                  <span>{item.dueDateKey ? `Due ${fmtDate(item.dueDateKey)}` : "No due date"}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
      {!byStatus.length ? <p className="empty-copy">No operational work is visible for the selected Jira statuses.</p> : null}
    </div>
  );
}

function MilestoneStrip({ items, onEdit }) {
  return (
    <div className="milestone-strip">
      {items.length ? (
        items.map((item) => (
          <button key={item.id} className="milestone-chip" style={{ "--milestone-color": item.jiraKey }} onClick={() => onEdit(item)}>
            <strong>{item.title}</strong>
            <span>{fmtDate(item.startKey, { month: "long", day: "numeric", year: "numeric" })}</span>
          </button>
        ))
      ) : (
        <p className="empty-copy">No milestones created yet.</p>
      )}
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
  const type = item.status === "MILESTONE" ? "milestone" : item.fromJira ? "ops" : "planned";

  return (
    <button className={`timeline-row ${type}`} onClick={() => onEdit(item)}>
      <div className="timeline-meta">
        <div className="timeline-type">
          <span className={`timeline-pill ${type}`}>{type === "planned" ? "Project" : type === "ops" ? "Ops" : "Milestone"}</span>
        </div>
        <div className="timeline-name">
          <strong>{item.title}</strong>
          <span>{item.fromJira ? item.jiraKey || item.status : fmtRange(item.startKey, item.endKey)}</span>
        </div>
        <div className="timeline-dates">
          <strong>
            {item.fromJira
              ? item.isDone && item.resolvedKey
                ? `Completed ${fmtDate(item.resolvedKey)}`
                : item.dueDateKey
                  ? `Due ${fmtDate(item.dueDateKey)}`
                  : "No due date"
              : fmtRange(item.startKey, item.endKey)}
          </strong>
          <span>{item.fromJira ? item.status || "Operational" : `${diffDays(item.startKey, item.endKey)} day duration`}</span>
        </div>
      </div>
      <div className="timeline-track">
        <div className="timeline-bar" style={{ left: `${(safeStart / days.length) * 100}%`, width: `${(span / days.length) * 100}%` }} />
      </div>
    </button>
  );
}

function GanttBoard({ members, assignments, milestones, days, showDone, selectedStatuses, onEditTask, onEditMilestone }) {
  const monthGroups = [];
  days.forEach((day) => {
    const key = `${day.getFullYear()}-${day.getMonth()}`;
    const label = day.toLocaleDateString("en-US", { month: "short" });
    const current = monthGroups[monthGroups.length - 1];
    if (current && current.key === key) current.count += 1;
    else monthGroups.push({ key, label, count: 1 });
  });

  return (
    <div className="gantt-board">
      <div className="gantt-months">
        {monthGroups.map((month) => (
          <div key={month.key} style={{ gridColumn: `span ${month.count}` }}>
            {month.label}
          </div>
        ))}
      </div>
      <div className="gantt-days">
        {days.map((day) => (
          <div key={dateKey(day)} className={`gantt-day ${dateKey(day) === TODAY_KEY ? "today" : ""}`}>
            <span>{day.toLocaleDateString("en-US", { month: "short" })}</span>
            <strong>{day.getDate()}</strong>
          </div>
        ))}
      </div>
      <div className="gantt-header-row">
        <div className="gantt-header-meta">
          <span>Type</span>
          <span>Work item</span>
          <span>Timing / status</span>
        </div>
        <div className="gantt-header-track">Timeline</div>
      </div>
      <div className="gantt-lanes">
        {members.map((member) => {
          const memberItems = assignments.filter((item) => {
            if (item.memberId !== member.id) return false;
            if (!showDone && item.isDone) return false;
            if (item.fromJira && !selectedStatuses.includes(item.status || "")) return false;
            return true;
          });
          const projects = memberItems.filter((item) => !item.fromJira && item.status !== "MILESTONE");
          const ops = memberItems.filter((item) => item.fromJira);

          return (
            <div key={member.id} className="gantt-member">
              <div className="gantt-member-head">
                <div className="person-lockup">
                  <div className="avatar" style={{ "--avatar-accent": member.color }}>
                    {member.initials}
                  </div>
                  <div>
                    <strong>{member.name}</strong>
                    <span>{member.role}</span>
                  </div>
                </div>
                <div className="gantt-member-summary">
                  <span>{projects.length} project</span>
                  <span>{ops.length} ops</span>
                </div>
              </div>
              <div className="gantt-member-body">
                {projects.length ? (
                  <div className="gantt-subgroup">
                    <div className="gantt-subgroup-label">Project delivery</div>
                    {projects.map((item) => (
                      <TimelineRow key={item.id} item={item} days={days} onEdit={onEditTask} />
                    ))}
                  </div>
                ) : null}
                {ops.length ? (
                  <div className="gantt-subgroup ops">
                    <div className="gantt-subgroup-label">Operational interruptions</div>
                    {ops.map((item) => (
                      <TimelineRow key={item.id} item={item} days={days} onEdit={onEditTask} />
                    ))}
                  </div>
                ) : null}
                {!projects.length && !ops.length ? <p className="empty-copy">No visible work assigned for this person.</p> : null}
              </div>
            </div>
          );
        })}
        {milestones.length ? (
          <div className="gantt-member milestone-group">
            <div className="gantt-member-head">
              <div>
                <strong>Shared milestones</strong>
                <span>Team-wide delivery checkpoints</span>
              </div>
            </div>
            <div className="gantt-member-body">
              <div className="gantt-subgroup">
                <div className="gantt-subgroup-label">Milestones</div>
                {milestones.map((item) => (
                  <TimelineRow key={item.id} item={item} days={days} onEdit={onEditMilestone} />
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function App() {
  useIsMobile();
  const [authStatus, setAuthStatus] = useState("checking");
  const [authConfigured, setAuthConfigured] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [viewMode, setViewMode] = useState("all");
  const [showDone, setShowDone] = useState(true);
  const [selectedJiraStatuses, setSelectedJiraStatuses] = useState([]);
  const [dashboardRange, setDashboardRange] = useState("30d");
  const [portfolioSort, setPortfolioSort] = useState("start");
  const [teamSort, setTeamSort] = useState("ops");
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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPriorities));
    } catch {
      // ignore
    }
  }, [nextPriorities]);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const response = await fetch("/api/session");
        const data = await response.json();
        if (cancelled) return;
        setAuthConfigured(data.authConfigured);
        setAuthStatus(data.authenticated ? "authenticated" : "unauthenticated");
      } catch (error) {
        console.error("Session check failed", error);
        if (!cancelled) {
          setAuthConfigured(true);
          setAuthStatus("unauthenticated");
        }
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") return;

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
  }, [authStatus]);

  const availableJiraStatuses = useMemo(
    () => [...new Set(assignments.filter((item) => item.fromJira).map((item) => item.status).filter(Boolean))].sort(),
    [assignments]
  );

  useEffect(() => {
    if (!availableJiraStatuses.length) return;
    setSelectedJiraStatuses((current) => {
      if (!current.length) return availableJiraStatuses;
      return [...new Set(current.filter((status) => availableJiraStatuses.includes(status)).concat(availableJiraStatuses))];
    });
  }, [availableJiraStatuses]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((item) => {
      if (!showDone && item.isDone) return false;
      if (item.fromJira && !selectedJiraStatuses.includes(item.status || "")) return false;
      if (viewMode === "planned") return !item.fromJira;
      if (viewMode === "ops") return item.fromJira;
      return true;
    });
  }, [assignments, selectedJiraStatuses, showDone, viewMode]);

  const milestones = useMemo(
    () => assignments.filter((item) => item.status === "MILESTONE").sort((a, b) => a.startKey.localeCompare(b.startKey)),
    [assignments]
  );

  const plannedItems = useMemo(
    () => filteredAssignments.filter((item) => !item.fromJira && item.status !== "MILESTONE"),
    [filteredAssignments]
  );
  const opsItems = useMemo(
    () => filteredAssignments.filter((item) => item.fromJira && !item.isDone),
    [filteredAssignments]
  );
  const overdueOps = useMemo(
    () => opsItems.filter((item) => item.dueDateKey && item.dueDateKey < TODAY_KEY),
    [opsItems]
  );

  const summary = useMemo(
    () => ({
      planned: assignments.filter((item) => !item.fromJira && item.status !== "MILESTONE" && !item.isDone).length,
      activeOps: assignments.filter((item) => item.fromJira && !item.isDone).length,
      milestones: milestones.length,
      overdueOps: assignments.filter((item) => item.fromJira && !item.isDone && item.dueDateKey && item.dueDateKey < TODAY_KEY).length,
    }),
    [assignments, milestones.length]
  );

  const dashboardWindow = useMemo(() => getRangeBounds(dashboardRange), [dashboardRange]);

  const dashboardMetrics = useMemo(
    () => ({
      plannedStarts: assignments.filter(
        (item) => !item.fromJira && item.status !== "MILESTONE" && isWithinRange(item.startKey, dashboardWindow.start, dashboardWindow.end)
      ).length,
      opsCompleted: assignments.filter(
        (item) => item.fromJira && item.isDone && isWithinRange(item.resolvedKey, dashboardWindow.start, dashboardWindow.end)
      ).length,
      dueInWindow: assignments.filter(
        (item) => item.fromJira && !item.isDone && isWithinRange(item.dueDateKey, dashboardWindow.start, dashboardWindow.end)
      ).length,
      milestones: assignments.filter(
        (item) => item.status === "MILESTONE" && isWithinRange(item.startKey, dashboardWindow.start, dashboardWindow.end)
      ).length,
    }),
    [assignments, dashboardWindow]
  );

  const portfolioItems = useMemo(
    () =>
      plannedItems
        .map((item) => ({
          item,
          owner: TEAM_MEMBERS.find((member) => member.id === item.memberId),
          opsCount: assignments.filter((assignment) => assignment.memberId === item.memberId && assignment.fromJira && !assignment.isDone).length,
        }))
        .sort((a, b) => {
          if (portfolioSort === "owner") {
            return (a.owner?.name || "").localeCompare(b.owner?.name || "");
          }
          if (portfolioSort === "risk") {
            return b.opsCount - a.opsCount;
          }
          if (portfolioSort === "duration") {
            return diffDays(b.item.startKey, b.item.endKey) - diffDays(a.item.startKey, a.item.endKey);
          }
          return (a.item.startKey || "9999-12-31").localeCompare(b.item.startKey || "9999-12-31");
        }),
    [assignments, plannedItems, portfolioSort]
  );

  const teamView = useMemo(
    () =>
      TEAM_MEMBERS.map((member) => ({
        member,
        projects: assignments.filter((item) => item.memberId === member.id && !item.fromJira && item.status !== "MILESTONE" && !item.isDone),
        opsItems: assignments.filter(
          (item) => item.memberId === member.id && item.fromJira && selectedJiraStatuses.includes(item.status || "")
        ),
      })).sort((a, b) => {
        if (teamSort === "name") return a.member.name.localeCompare(b.member.name);
        if (teamSort === "projects") return b.projects.length - a.projects.length;
        return b.opsItems.filter((item) => !item.isDone).length - a.opsItems.filter((item) => !item.isDone).length;
      }),
    [assignments, selectedJiraStatuses, teamSort]
  );

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

    if (editingAssignment) {
      updateAssignments((current) =>
        current.map((item) =>
          item.id === editingAssignment.id
            ? {
                ...item,
                title: taskForm.title.trim(),
                memberId: Number(taskForm.memberId),
                startKey: taskForm.fromJira ? null : taskForm.startKey,
                endKey: taskForm.fromJira ? null : taskForm.endKey,
                dueDateKey: taskForm.fromJira ? taskForm.dueDateKey : null,
              }
            : item
        )
      );
    } else {
      updateAssignments((current) => [
        ...current,
        {
          id: `manual-${nextId.current++}-${Date.now()}`,
          title: taskForm.title.trim(),
          memberId: Number(taskForm.memberId),
          startKey: taskForm.startKey,
          endKey: taskForm.endKey,
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

    if (editingPriority) setNextPriorities((current) => current.map((item) => (item.id === editingPriority.id ? payload : item)));
    else setNextPriorities((current) => [...current, payload]);

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

  async function handleLogin(event) {
    event.preventDefault();
    setLoginSubmitting(true);
    setLoginError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Login failed");
      }

      setAuthStatus("authenticated");
      setLoginForm({ username: "", password: "" });
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setLoginSubmitting(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    setAssignments([]);
    setAuthStatus("unauthenticated");
  }

  if (authStatus === "checking") {
    return (
      <div className="pm-app">
        <section className="loading-panel">
          <div className="spinner" />
          <p>Checking secure access...</p>
        </section>
      </div>
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <div className="pm-app auth-app">
        <section className="auth-card">
          <div className="pm-badge">Secure access</div>
          <h1>Sign in to Team Planner</h1>
          <p>
            Use the application credentials to access portfolio planning, Jira operational data, and saved assignments.
          </p>
          {!authConfigured ? (
            <div className="auth-warning">
              `APP_LOGIN_USER` and `APP_LOGIN_PASSWORD` are not configured yet, so the app cannot validate a login.
            </div>
          ) : null}
          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              <span>Username</span>
              <input
                value={loginForm.username}
                onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))}
                autoComplete="username"
              />
            </label>
            <label>
              <span>Password</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                autoComplete="current-password"
              />
            </label>
            {loginError ? <div className="auth-error">{loginError}</div> : null}
            <button className="primary-button" type="submit" disabled={loginSubmitting || !authConfigured}>
              {loginSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="pm-app">
      <header className="pm-topbar">
        <div className="pm-brand">
          <span className="pm-badge">Portfolio planner</span>
          <h1>Delivery portfolio for web development</h1>
        </div>
        <div className="pm-actions">
          <SaveStatus status={saveStatus} />
          <button className="ghost-button" onClick={handleLogout}>
            Log out
          </button>
          <button className="ghost-button" onClick={() => setShowDone((current) => !current)}>
            {showDone ? "Hide completed" : "Show completed"}
          </button>
          <button className="ghost-button" onClick={openNewMilestone}>
            Add milestone
          </button>
          <button className="primary-button" onClick={() => openNewTask(1)}>
            Add project item
          </button>
          <button className="sync-button" onClick={syncFromJira} disabled={syncing}>
            {syncing ? "Syncing Jira..." : "Sync Jira"}
          </button>
        </div>
      </header>

      {syncStatus ? <div className={`pm-banner ${syncStatus.type}`}>{syncStatus.message}</div> : null}

      <div className="pm-stats">
        <StatCard label="Projects started" value={dashboardMetrics.plannedStarts} detail={dashboardWindow.label} tone="blue" />
        <StatCard label="Ops completed" value={dashboardMetrics.opsCompleted} detail={dashboardWindow.label} tone="green" />
        <StatCard label="Ops due" value={dashboardMetrics.dueInWindow} detail={dashboardWindow.label} tone="orange" />
        <StatCard label="Milestones" value={dashboardMetrics.milestones} detail={dashboardWindow.label} tone="purple" />
      </div>

      <div className="pm-toolbar">
        <div className="segmented-control">
          <button className={viewMode === "all" ? "active" : ""} onClick={() => setViewMode("all")}>
            All work
          </button>
          <button className={viewMode === "planned" ? "active" : ""} onClick={() => setViewMode("planned")}>
            Project delivery
          </button>
          <button className={viewMode === "ops" ? "active" : ""} onClick={() => setViewMode("ops")}>
            Operational only
          </button>
        </div>
        <div className="toolbar-date">
          <span>Today</span>
          <strong>{fmtDate(TODAY_KEY, { month: "long", day: "numeric", year: "numeric" })}</strong>
        </div>
      </div>

      <div className="dashboard-controls">
        <div className="segmented-control">
          <button className={dashboardRange === "30d" ? "active" : ""} onClick={() => setDashboardRange("30d")}>
            Last 30 days
          </button>
          <button className={dashboardRange === "q1" ? "active" : ""} onClick={() => setDashboardRange("q1")}>
            Q1
          </button>
          <button className={dashboardRange === "q2" ? "active" : ""} onClick={() => setDashboardRange("q2")}>
            Q2
          </button>
          <button className={dashboardRange === "ytd" ? "active" : ""} onClick={() => setDashboardRange("ytd")}>
            YTD
          </button>
        </div>
        <div className="sort-controls">
          <label>
            <span>Portfolio sort</span>
            <select value={portfolioSort} onChange={(event) => setPortfolioSort(event.target.value)}>
              <option value="start">Start date</option>
              <option value="owner">Owner</option>
              <option value="risk">Most ops pressure</option>
              <option value="duration">Longest duration</option>
            </select>
          </label>
          <label>
            <span>Team sort</span>
            <select value={teamSort} onChange={(event) => setTeamSort(event.target.value)}>
              <option value="ops">Most ops load</option>
              <option value="projects">Most project work</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
      </div>

      {viewMode !== "planned" ? (
        <div className="status-filter-bar">
          <div className="status-filter-copy">
            <strong>Operational status filters</strong>
            <span>Refine Jira work by status so you can define what counts as operational load.</span>
          </div>
          <div className="status-filter-row">
            <button className="ghost-button" onClick={() => setSelectedJiraStatuses(availableJiraStatuses)}>
              Select all
            </button>
            <button className="ghost-button" onClick={() => setSelectedJiraStatuses([])}>
              Clear all
            </button>
            <div className="status-filter-chips">
              {availableJiraStatuses.map((status) => (
                <FilterChip
                  key={status}
                  label={status}
                  active={selectedJiraStatuses.includes(status)}
                  onClick={() =>
                    setSelectedJiraStatuses((current) =>
                      current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
                    )
                  }
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <section className="loading-panel">
          <div className="spinner" />
          <p>Loading delivery data and Jira work...</p>
        </section>
      ) : (
        <main className="pm-grid">
          <Section eyebrow="Portfolio" title="Delivery portfolio" wide>
            <div className="initiative-grid">
              {portfolioItems.length ? (
                portfolioItems.map(({ item, owner, opsCount }) => (
                  <InitiativeCard key={item.id} item={item} owner={owner} opsCount={opsCount} onEdit={openTask} />
                ))
              ) : (
                <p className="empty-copy">No planned project delivery items are visible in this view.</p>
              )}
            </div>
          </Section>

          <Section
            eyebrow="Priorities"
            title="Upcoming priorities"
            action={
              <button className="ghost-button" onClick={openNewPriority}>
                Add priority
              </button>
            }
          >
            <div className="priority-board">
              {nextPriorities.length ? (
                nextPriorities.map((item) => (
                  <button key={item.id} className="priority-card" style={{ "--priority-accent": item.color }} onClick={() => openPriority(item)}>
                    <strong>{item.title}</strong>
                    <span>{item.startKey ? fmtRange(item.startKey, item.endKey) : "Needs scheduling"}</span>
                  </button>
                ))
              ) : (
                <p className="empty-copy">No upcoming priorities captured yet.</p>
              )}
            </div>
          </Section>

          <Section eyebrow="Milestones" title="Dates the team is working toward">
            <MilestoneStrip items={milestones} onEdit={openMilestone} />
          </Section>

          <Section eyebrow="Team management" title="Work by team member" wide>
            <div className="team-grid">
              {teamView.map(({ member, projects, opsItems: memberOps }) => (
                <TeamCard key={member.id} member={member} projects={projects} opsItems={memberOps} onEditTask={openTask} />
              ))}
            </div>
          </Section>

          <Section eyebrow="Operations" title="Jira workflow board" wide>
            <JiraBoard items={opsItems} onEdit={openTask} />
          </Section>

          <Section eyebrow="Program timeline" title="60-day delivery map" wide>
            <GanttBoard
              members={TEAM_MEMBERS}
              assignments={filteredAssignments}
              milestones={milestones}
              days={timelineDays}
              showDone={showDone}
              selectedStatuses={selectedJiraStatuses}
              onEditTask={openTask}
              onEditMilestone={openMilestone}
            />
          </Section>
        </main>
      )}

      {showTaskModal ? (
        <div className="modal-backdrop" onClick={() => setShowTaskModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="section-eyebrow">{editingAssignment?.fromJira ? "Operational item" : "Planned delivery item"}</div>
                <h3>{editingAssignment ? "Edit item" : "New project item"}</h3>
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
              <select value={taskForm.memberId} onChange={(event) => setTaskForm((current) => ({ ...current, memberId: Number(event.target.value) }))}>
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
                  <input type="date" value={taskForm.startKey} onChange={(event) => setTaskForm((current) => ({ ...current, startKey: event.target.value }))} />
                </label>
                <label>
                  <span>End date</span>
                  <input type="date" value={taskForm.endKey} min={taskForm.startKey} onChange={(event) => setTaskForm((current) => ({ ...current, endKey: event.target.value }))} />
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
                <div className="section-eyebrow">Milestone</div>
                <h3>{editingMilestone ? "Edit milestone" : "New milestone"}</h3>
              </div>
              <button className="icon-button" onClick={() => setShowMilestoneModal(false)}>
                x
              </button>
            </div>

            <label>
              <span>Milestone name</span>
              <input value={milestoneForm.title} onChange={(event) => setMilestoneForm((current) => ({ ...current, title: event.target.value }))} />
            </label>

            <label>
              <span>Date</span>
              <input type="date" value={milestoneForm.dateKey} onChange={(event) => setMilestoneForm((current) => ({ ...current, dateKey: event.target.value }))} />
            </label>

            <div>
              <span className="field-label">Color tag</span>
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
                <div className="section-eyebrow">Upcoming priority</div>
                <h3>{editingPriority ? "Edit priority" : "New priority"}</h3>
              </div>
              <button className="icon-button" onClick={() => setShowPriorityModal(false)}>
                x
              </button>
            </div>

            <label>
              <span>Title</span>
              <input value={priorityForm.title} onChange={(event) => setPriorityForm((current) => ({ ...current, title: event.target.value }))} />
            </label>

            <div className="modal-grid">
              <label>
                <span>Start date</span>
                <input type="date" value={priorityForm.startKey} onChange={(event) => setPriorityForm((current) => ({ ...current, startKey: event.target.value }))} />
              </label>
              <label>
                <span>End date</span>
                <input type="date" value={priorityForm.endKey} min={priorityForm.startKey} onChange={(event) => setPriorityForm((current) => ({ ...current, endKey: event.target.value }))} />
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
