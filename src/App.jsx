import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const TEAM_MEMBERS = [
  { id: 1, name: "Ryan Geraghty", role: "Director, Software Development", color: "#2563eb", initials: "RG" },
  { id: 2, name: "Michael Santilli", role: "Sr. Web Developer", color: "#0f766e", initials: "MS" },
  { id: 3, name: "John Kaeser", role: "Sr. Developer", color: "#c2410c", initials: "JK" },
  { id: 4, name: "Jason Moore", role: "Web Developer", color: "#7c3aed", initials: "JM" },
];

const JIRA_BASE = "https://hmpglobal.atlassian.net/browse";
const PRIORITY_STORAGE_KEY = "nextPriorities";
const PRIORITY_COLORS = ["#2563eb", "#0f766e", "#c2410c", "#7c3aed", "#be185d", "#374151"];
const MILESTONE_COLORS = ["#d97706", "#4f46e5", "#db2777", "#059669", "#dc2626", "#0057b8"];

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TODAY_KEY = dateKey(TODAY);

function dateKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function fmtDate(key, options = { month: "short", day: "numeric" }) {
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", options);
}

function fmtRange(startKey, endKey) {
  if (!startKey && !endKey) return "No schedule";
  if (!endKey || startKey === endKey) return fmtDate(startKey || endKey);
  return `${fmtDate(startKey)} - ${fmtDate(endKey)}`;
}

function diffDays(startKey, endKey) {
  if (!startKey || !endKey) return 0;
  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function getActiveDate(item) {
  return item.dueDateKey || item.endKey || item.startKey || item.resolvedKey || null;
}

function getDateState(item) {
  const key = item.dueDateKey || item.endKey || null;
  if (!key) return "no_due";
  if (!item.isDone && key < TODAY_KEY) return "overdue";
  if (!item.isDone && key >= TODAY_KEY && key <= dateKey(addDays(TODAY, 7))) return "soon";
  return "dated";
}

function getWindow(windowKey) {
  const year = TODAY.getFullYear();
  const quarterMap = {
    q1: { start: `${year}-01-01`, end: `${year}-03-31`, label: `Q1 ${year}` },
    q2: { start: `${year}-04-01`, end: `${year}-06-30`, label: `Q2 ${year}` },
    q3: { start: `${year}-07-01`, end: `${year}-09-30`, label: `Q3 ${year}` },
    q4: { start: `${year}-10-01`, end: `${year}-12-31`, label: `Q4 ${year}` },
  };

  if (windowKey === "30d") {
    return { start: dateKey(addDays(TODAY, -29)), end: TODAY_KEY, label: "Last 30 days" };
  }
  if (windowKey === "ytd") {
    return { start: `${year}-01-01`, end: TODAY_KEY, label: "Year to date" };
  }
  return quarterMap[windowKey] || { start: dateKey(addDays(TODAY, -29)), end: TODAY_KEY, label: "Last 30 days" };
}

function isInWindow(key, window) {
  if (!key) return false;
  return key >= window.start && key <= window.end;
}

function SaveStatus({ status }) {
  if (!status) return null;
  const copy = { saving: "Saving", saved: "Saved", error: "Save failed" };
  return <span className={`save-status ${status}`}>{copy[status]}</span>;
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="filter-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatCard({ label, value, detail, tone }) {
  return (
    <div className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <section className="section-card">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function TeamAccordion({ member, items, onEdit }) {
  const [open, setOpen] = useState(member.id === 1);
  const projectItems = items.filter((item) => !item.fromJira && item.status !== "MILESTONE");
  const operationalItems = items
    .filter((item) => item.fromJira)
    .sort((a, b) => {
      const aKey = a.dueDateKey || "9999-12-31";
      const bKey = b.dueDateKey || "9999-12-31";
      return aKey.localeCompare(bKey);
    });

  return (
    <div className="person-accordion">
      <button className="person-accordion-head" onClick={() => setOpen((current) => !current)}>
        <div className="person-lockup">
          <span className="caret">{open ? "▾" : "▸"}</span>
          <div className="avatar" style={{ "--avatar-accent": member.color }}>
            {member.initials}
          </div>
          <div>
            <strong>{member.name}</strong>
            <span>{member.role}</span>
          </div>
        </div>
        <div className="person-summary">
          <span>{projectItems.length} project</span>
          <span>{operationalItems.length} ops</span>
        </div>
      </button>

      {open ? (
        <div className="person-accordion-body">
          <div className="work-column project">
            <div className="column-head">
              <strong>Project work</strong>
              <span>Manual project-level work</span>
            </div>
            {projectItems.length ? (
              <div className="work-list">
                {projectItems.map((item) => (
                  <button key={item.id} className="work-row project" onClick={() => onEdit(item)}>
                    <strong>{item.title}</strong>
                    <span>{fmtRange(item.startKey, item.endKey)}</span>
                    <em>{diffDays(item.startKey, item.endKey)} day duration</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No project work for the current filters.</p>
            )}
          </div>

          <div className="work-column ops">
            <div className="column-head">
              <strong>Operational work</strong>
              <span>Jira synced, ordered by due date</span>
            </div>
            {operationalItems.length ? (
              <div className="work-list">
                {operationalItems.map((item) => (
                  <button key={item.id} className="work-row ops" onClick={() => onEdit(item)}>
                    <strong>{item.title}</strong>
                    <span>
                      {item.status || "Operational"}
                      {item.dueDateKey ? ` · Due ${fmtDate(item.dueDateKey)}` : " · No due date"}
                    </span>
                    <em>{item.jiraKey || "Jira item"}</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No operational work for the current filters.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PriorityCard({ item, onEdit }) {
  return (
    <button className="priority-card" style={{ "--priority-accent": item.color }} onClick={() => onEdit(item)}>
      <strong>{item.title}</strong>
      <span>{item.startKey ? fmtRange(item.startKey, item.endKey) : "Needs scheduling"}</span>
    </button>
  );
}

function MilestoneList({ items, onEdit }) {
  return (
    <div className="milestone-list">
      {items.length ? (
        items.map((item) => (
          <button key={item.id} className="milestone-item" style={{ "--milestone-accent": item.jiraKey }} onClick={() => onEdit(item)}>
            <strong>{item.title}</strong>
            <span>{fmtDate(item.startKey, { month: "long", day: "numeric", year: "numeric" })}</span>
          </button>
        ))
      ) : (
        <p className="empty-copy">No milestones in the current view.</p>
      )}
    </div>
  );
}

function ActivityTable({ items, onEdit }) {
  return (
    <div className="table-list">
      {items.length ? (
        items.map((item) => (
          <button key={item.id} className="table-row" onClick={() => onEdit(item)}>
            <div>
              <strong>{item.title}</strong>
              <span>{TEAM_MEMBERS.find((member) => member.id === item.memberId)?.name || "Team"}</span>
            </div>
            <div className="table-meta">
              <span>{item.fromJira ? item.status || item.jiraKey : fmtRange(item.startKey, item.endKey)}</span>
              <span>
                {item.resolvedKey
                  ? `Completed ${fmtDate(item.resolvedKey)}`
                  : getActiveDate(item)
                    ? fmtDate(getActiveDate(item))
                    : "No date"}
              </span>
            </div>
          </button>
        ))
      ) : (
        <p className="empty-copy">No matching items for this view.</p>
      )}
    </div>
  );
}

export default function App() {
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

  const [teamFilter, setTeamFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [completionFilter, setCompletionFilter] = useState("active");
  const [dashboardWindowKey, setDashboardWindowKey] = useState("30d");
  const [sortKey, setSortKey] = useState("due");
  const [selectedJiraStatuses, setSelectedJiraStatuses] = useState([]);

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
  const [milestoneForm, setMilestoneForm] = useState({ title: "", dateKey: TODAY_KEY, color: MILESTONE_COLORS[0] });
  const [priorityForm, setPriorityForm] = useState({ title: "", startKey: "", endKey: "", color: PRIORITY_COLORS[0] });
  const [nextPriorities, setNextPriorities] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(PRIORITY_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  });

  const nextId = useRef(300);
  const saveTimer = useRef(null);
  const dashboardWindow = useMemo(() => getWindow(dashboardWindowKey), [dashboardWindowKey]);

  useEffect(() => {
    try {
      localStorage.setItem(PRIORITY_STORAGE_KEY, JSON.stringify(nextPriorities));
    } catch {
      // ignore storage failures
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
        if (assignmentsResponse.status === 401) {
          setAuthStatus("unauthenticated");
          return;
        }
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

        if (activeResponse.status === 401 || doneResponse.status === 401) {
          setAuthStatus("unauthenticated");
          return;
        }

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

  const milestones = useMemo(
    () => assignments.filter((item) => item.status === "MILESTONE").sort((a, b) => a.startKey.localeCompare(b.startKey)),
    [assignments]
  );

  const visibleItems = useMemo(() => {
    const filtered = assignments.filter((item) => {
      if (item.status === "MILESTONE") return false;

      if (teamFilter !== "all" && String(item.memberId) !== teamFilter) return false;

      if (sourceFilter === "project" && item.fromJira) return false;
      if (sourceFilter === "ops" && !item.fromJira) return false;

      if (completionFilter === "active" && item.isDone) return false;
      if (completionFilter === "complete" && !item.isDone) return false;

      const dateState = getDateState(item);
      if (dueFilter === "has_due" && dateState === "no_due") return false;
      if (dueFilter === "no_due" && dateState !== "no_due") return false;
      if (dueFilter === "overdue" && dateState !== "overdue") return false;
      if (dueFilter === "soon" && dateState !== "soon") return false;

      if (item.fromJira && !selectedJiraStatuses.includes(item.status || "")) return false;

      return true;
    });

    return filtered.sort((a, b) => {
      if (sortKey === "owner") {
        const aName = TEAM_MEMBERS.find((member) => member.id === a.memberId)?.name || "";
        const bName = TEAM_MEMBERS.find((member) => member.id === b.memberId)?.name || "";
        return aName.localeCompare(bName);
      }
      if (sortKey === "recent_complete") {
        return (b.resolvedKey || "").localeCompare(a.resolvedKey || "");
      }
      if (sortKey === "start") {
        return (a.startKey || "9999-12-31").localeCompare(b.startKey || "9999-12-31");
      }
      if (sortKey === "title") {
        return a.title.localeCompare(b.title);
      }
      return (getActiveDate(a) || "9999-12-31").localeCompare(getActiveDate(b) || "9999-12-31");
    });
  }, [assignments, completionFilter, dueFilter, selectedJiraStatuses, sortKey, sourceFilter, teamFilter]);

  const dashboardMetrics = useMemo(
    () => ({
      projectStarts: assignments.filter(
        (item) => !item.fromJira && item.status !== "MILESTONE" && isInWindow(item.startKey, dashboardWindow)
      ).length,
      opsDue: assignments.filter(
        (item) => item.fromJira && !item.isDone && isInWindow(item.dueDateKey, dashboardWindow)
      ).length,
      completed: assignments.filter((item) => item.isDone && isInWindow(item.resolvedKey, dashboardWindow)).length,
      milestones: milestones.filter((item) => isInWindow(item.startKey, dashboardWindow)).length,
    }),
    [assignments, dashboardWindow, milestones]
  );

  const teamPanels = useMemo(
    () =>
      TEAM_MEMBERS.map((member) => ({
        member,
        items: visibleItems.filter((item) => item.memberId === member.id),
      })).filter((panel) => panel.items.length || teamFilter === "all" || String(panel.member.id) === teamFilter),
    [teamFilter, visibleItems]
  );

  const recentCompleted = useMemo(
    () =>
      assignments
        .filter((item) => item.isDone && isInWindow(item.resolvedKey, dashboardWindow))
        .sort((a, b) => (b.resolvedKey || "").localeCompare(a.resolvedKey || ""))
        .slice(0, 8),
    [assignments, dashboardWindow]
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

    const nextItem = {
      ...editingAssignment,
      title: taskForm.title.trim(),
      memberId: Number(taskForm.memberId),
      startKey: taskForm.fromJira ? null : taskForm.startKey,
      endKey: taskForm.fromJira ? null : taskForm.endKey,
      dueDateKey: taskForm.fromJira ? taskForm.dueDateKey : null,
    };

    if (editingAssignment) {
      updateAssignments((current) => current.map((item) => (item.id === editingAssignment.id ? nextItem : item)));
    } else {
      updateAssignments((current) => [
        ...current,
        {
          id: `manual-${nextId.current++}-${Date.now()}`,
          title: nextItem.title,
          memberId: nextItem.memberId,
          startKey: nextItem.startKey,
          endKey: nextItem.endKey,
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

    if (editingMilestone) updateAssignments((current) => current.map((item) => (item.id === editingMilestone.id ? payload : item)));
    else updateAssignments((current) => [...current, payload]);

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

      if (activeResponse.status === 401 || doneResponse.status === 401) {
        setAuthStatus("unauthenticated");
        return;
      }

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
      <div className="planner-app">
        <section className="loading-card">
          <div className="spinner" />
          <p>Checking secure access...</p>
        </section>
      </div>
    );
  }

  if (authStatus !== "authenticated") {
    return (
      <div className="planner-app auth-shell">
        <section className="auth-card">
          <div className="auth-badge">Secure access</div>
          <h1>Sign in to Team Planner</h1>
          <p>Use the application credentials to access project, operational, and reporting data.</p>
          {!authConfigured ? (
            <div className="auth-warning">`APP_LOGIN_USER` and `APP_LOGIN_PASSWORD` are not configured yet.</div>
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
    <div className="planner-app">
      <div className="topbar">
        <div className="topbar-title">
          <h1>Team Planner</h1>
          <span>Clear ownership across project and operational work</span>
        </div>
        <div className="topbar-actions">
          <SaveStatus status={saveStatus} />
          <button className="ghost-button" onClick={handleLogout}>
            Log out
          </button>
          <button className="ghost-button" onClick={openNewMilestone}>
            Add milestone
          </button>
          <button className="primary-button" onClick={() => openNewTask(1)}>
            Add work item
          </button>
          <button className="sync-button" onClick={syncFromJira} disabled={syncing}>
            {syncing ? "Syncing Jira..." : "Sync Jira"}
          </button>
        </div>
      </div>

      {syncStatus ? <div className={`banner ${syncStatus.type}`}>{syncStatus.message}</div> : null}

      <div className="filter-bar">
        <FilterSelect
          label="Team member"
          value={teamFilter}
          onChange={setTeamFilter}
          options={[{ value: "all", label: "All team members" }, ...TEAM_MEMBERS.map((member) => ({ value: String(member.id), label: member.name }))]}
        />
        <FilterSelect
          label="Work type"
          value={sourceFilter}
          onChange={setSourceFilter}
          options={[
            { value: "all", label: "Project + operational" },
            { value: "project", label: "Project only" },
            { value: "ops", label: "Operational only" },
          ]}
        />
        <FilterSelect
          label="Due date"
          value={dueFilter}
          onChange={setDueFilter}
          options={[
            { value: "all", label: "All items" },
            { value: "has_due", label: "Has due date" },
            { value: "no_due", label: "No due date" },
            { value: "overdue", label: "Overdue" },
            { value: "soon", label: "Due in 7 days" },
          ]}
        />
        <FilterSelect
          label="Completion"
          value={completionFilter}
          onChange={setCompletionFilter}
          options={[
            { value: "active", label: "Active only" },
            { value: "complete", label: "Complete only" },
            { value: "all", label: "Active + complete" },
          ]}
        />
        <FilterSelect
          label="Sort"
          value={sortKey}
          onChange={setSortKey}
          options={[
            { value: "due", label: "Due date" },
            { value: "owner", label: "Owner" },
            { value: "recent_complete", label: "Recently completed" },
            { value: "start", label: "Start date" },
            { value: "title", label: "Title" },
          ]}
        />
      </div>

      <div className="subfilter-bar">
        <div className="window-toggle">
          {[
            { value: "30d", label: "Last 30 days" },
            { value: "q1", label: "Q1" },
            { value: "q2", label: "Q2" },
            { value: "ytd", label: "YTD" },
          ].map((option) => (
            <button
              key={option.value}
              className={dashboardWindowKey === option.value ? "active" : ""}
              onClick={() => setDashboardWindowKey(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="status-chip-row">
          {availableJiraStatuses.map((status) => (
            <button
              key={status}
              className={`status-chip ${selectedJiraStatuses.includes(status) ? "active" : ""}`}
              onClick={() =>
                setSelectedJiraStatuses((current) =>
                  current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
                )
              }
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <section className="loading-card">
          <div className="spinner" />
          <p>Loading assignments and Jira work...</p>
        </section>
      ) : (
        <>
          <div className="stat-grid">
            <StatCard label="Projects started" value={dashboardMetrics.projectStarts} detail={dashboardWindow.label} tone="blue" />
            <StatCard label="Ops due" value={dashboardMetrics.opsDue} detail={dashboardWindow.label} tone="orange" />
            <StatCard label="Completed" value={dashboardMetrics.completed} detail={dashboardWindow.label} tone="green" />
            <StatCard label="Milestones" value={dashboardMetrics.milestones} detail={dashboardWindow.label} tone="purple" />
          </div>

          <div className="layout-grid">
            <div className="main-column">
              <Section
                title="Team work overview"
                action={<button className="ghost-button" onClick={() => setSelectedJiraStatuses(availableJiraStatuses)}>Reset statuses</button>}
              >
                {teamPanels.length ? (
                  <div className="accordion-list">
                    {teamPanels.map((panel) => (
                      <TeamAccordion key={panel.member.id} member={panel.member} items={panel.items} onEdit={openTask} />
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">No work matches the current filters.</p>
                )}
              </Section>

              <Section title="Recent completions">
                <ActivityTable items={recentCompleted} onEdit={openTask} />
              </Section>
            </div>

            <div className="side-column">
              <Section
                title="Upcoming priorities"
                action={<button className="ghost-button" onClick={openNewPriority}>Add</button>}
              >
                <div className="priority-list">
                  {nextPriorities.length ? nextPriorities.map((item) => <PriorityCard key={item.id} item={item} onEdit={openPriority} />) : <p className="empty-copy">No priorities captured yet.</p>}
                </div>
              </Section>

              <Section title="Milestones">
                <MilestoneList items={milestones.filter((item) => isInWindow(item.startKey, dashboardWindow))} onEdit={openMilestone} />
              </Section>
            </div>
          </div>
        </>
      )}

      {showTaskModal ? (
        <div className="modal-backdrop" onClick={() => setShowTaskModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="modal-eyebrow">{editingAssignment?.fromJira ? "Operational item" : "Project item"}</div>
                <h3>{editingAssignment ? "Edit work item" : "New work item"}</h3>
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
                <div className="modal-eyebrow">Milestone</div>
                <h3>{editingMilestone ? "Edit milestone" : "New milestone"}</h3>
              </div>
              <button className="icon-button" onClick={() => setShowMilestoneModal(false)}>
                x
              </button>
            </div>

            <label>
              <span>Name</span>
              <input value={milestoneForm.title} onChange={(event) => setMilestoneForm((current) => ({ ...current, title: event.target.value }))} />
            </label>

            <label>
              <span>Date</span>
              <input type="date" value={milestoneForm.dateKey} onChange={(event) => setMilestoneForm((current) => ({ ...current, dateKey: event.target.value }))} />
            </label>

            <div>
              <span className="field-label">Color</span>
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
                <div className="modal-eyebrow">Upcoming priority</div>
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
              <span className="field-label">Color</span>
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
