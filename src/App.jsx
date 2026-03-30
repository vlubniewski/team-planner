import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const TEAM_MEMBERS = [
  { id: 1, name: "Ryan Geraghty", role: "Director, Software Development", color: "#0f766e", initials: "RG", jiraAliases: ["ryan geraghty", "ryan"] },
  { id: 2, name: "Michael Santilli", role: "Sr. Web Developer", color: "#2563eb", initials: "MS", jiraAliases: ["michael santilli", "michael", "mike santilli", "mike"] },
  { id: 3, name: "John Kaeser", role: "Sr. Developer", color: "#c2410c", initials: "JK", jiraAliases: ["john kaeser", "john"] },
  { id: 4, name: "Jason Moore", role: "Web Developer", color: "#7c3aed", initials: "JM", jiraAliases: ["jason moore", "jason"] },
];

const ACTIVE_STATUSES = ["Ready to Work", "Selected for Development", "In Progress", "Testing", "Ready for Release"];
const HORIZON_OPTIONS = [30, 60, 90];
const DEFAULT_HORIZON = 60;
const JIRA_BASE = "https://hmpglobal.atlassian.net/browse";
const JIRA_OVERRIDE_STORAGE_KEY = "jiraScheduleOverrides";

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TODAY_KEY = dateKey(TODAY);

function dateKey(date) {
  const local = new Date(date);
  local.setHours(12, 0, 0, 0);
  return local.toISOString().slice(0, 10);
}

function parseDate(key) {
  return new Date(`${key}T12:00:00`);
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function diffDaysInclusive(startKey, endKey) {
  if (!startKey || !endKey) return 1;
  return Math.max(1, Math.round((parseDate(endKey) - parseDate(startKey)) / 86400000) + 1);
}

function fmtDate(key, options = { month: "short", day: "numeric" }) {
  if (!key) return "Unscheduled";
  return parseDate(key).toLocaleDateString("en-US", options);
}

function fmtRange(startKey, endKey) {
  if (!startKey && !endKey) return "Needs schedule";
  if (!endKey || startKey === endKey) return fmtDate(startKey || endKey);
  return `${fmtDate(startKey)} - ${fmtDate(endKey)}`;
}

function getWeekStart(date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function buildWeekColumns(days) {
  const weekCount = Math.ceil(days / 7);
  const start = getWeekStart(TODAY);
  return Array.from({ length: weekCount }, (_, index) => {
    const weekStart = addDays(start, index * 7);
    const weekEnd = addDays(weekStart, 6);
    return {
      index,
      startKey: dateKey(weekStart),
      endKey: dateKey(weekEnd),
      label: `Week of ${fmtDate(dateKey(weekStart), { month: "short", day: "numeric" })}`,
      shortLabel: fmtDate(dateKey(weekStart), { month: "short", day: "numeric" }),
    };
  });
}

function itemTimeline(item, jiraOverrides) {
  const override = item.fromJira ? jiraOverrides[item.id] : null;
  const startKey = item.startKey || override?.startKey || item.dueDateKey || item.resolvedKey || TODAY_KEY;
  const endKey = item.endKey || override?.endKey || item.dueDateKey || item.resolvedKey || startKey;
  return { startKey, endKey };
}

function weeksTouched(item, weeks, jiraOverrides) {
  const { startKey, endKey } = itemTimeline(item, jiraOverrides);
  return weeks.filter((week) => startKey <= week.endKey && endKey >= week.startKey).map((week) => week.index);
}

function findMember(memberId) {
  return TEAM_MEMBERS.find((member) => member.id === memberId);
}

function normalizeName(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function findMemberByAssignee(assignee) {
  const displayName = normalizeName(assignee?.displayName);
  if (!displayName) return null;

  return (
    TEAM_MEMBERS.find((member) => (member.jiraAliases || []).some((alias) => displayName.includes(alias))) ||
    TEAM_MEMBERS.find((member) => {
      const parts = normalizeName(member.name).split(" ");
      return parts.every((part) => displayName.includes(part));
    }) ||
    null
  );
}

function chipLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function SaveStatus({ status }) {
  if (!status) return null;
  const labels = { saving: "Saving", saved: "Saved", error: "Save failed" };
  return <span className={`save-status ${status}`}>{labels[status]}</span>;
}

function StatCard({ label, value, detail }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function FilterChip({ active, label, onClick }) {
  return (
    <button className={`filter-chip ${active ? "active" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
}

function WorkloadLegend() {
  return (
    <div className="legend-row">
      <div className="legend-item">
        <span className="legend-swatch project" />
        <span>Planned project work</span>
      </div>
      <div className="legend-item">
        <span className="legend-swatch ops" />
        <span>Jira operational work</span>
      </div>
      <div className="legend-item">
        <span className="legend-swatch done" />
        <span>Recently completed</span>
      </div>
    </div>
  );
}

function AssignmentCard({ item, jiraOverrides, onEdit, onDragStart, onDragEnd }) {
  const owner = findMember(item.memberId);
  const { startKey, endKey } = itemTimeline(item, jiraOverrides);

  return (
    <button
      draggable
      className={`assignment-card ${item.fromJira ? "ops" : "project"} ${item.isDone ? "done" : ""}`}
      style={{ "--card-accent": owner?.color || "#475569" }}
      onClick={() => onEdit(item)}
      onDragStart={(event) => onDragStart(event, item)}
      onDragEnd={onDragEnd}
    >
      <div className="assignment-card-head">
        <span className="assignment-type">{item.fromJira ? "Ops" : "Project"}</span>
        <span className="assignment-owner">{owner?.initials || "TM"}</span>
      </div>
      <strong>{item.title}</strong>
      <p>{fmtRange(startKey, endKey)}</p>
      <div className="assignment-meta">
        <span>{item.fromJira ? item.jiraKey || item.status || "Jira item" : `${diffDaysInclusive(startKey, endKey)} day block`}</span>
        <span>{item.status || (item.isDone ? "Done" : "Scheduled")}</span>
      </div>
    </button>
  );
}

function TeamCalendarRow({
  member,
  weeks,
  items,
  jiraOverrides,
  dragging,
  onDropItem,
  onEditItem,
  onDragStart,
  onDragEnd,
}) {
  return (
    <div className="calendar-row">
      <div className="calendar-row-meta">
        <div className="member-lockup">
          <div className="avatar" style={{ "--avatar-accent": member.color }}>
            {member.initials}
          </div>
          <div>
            <strong>{member.name}</strong>
            <span>{member.role}</span>
          </div>
        </div>
        <div className="member-pills">
          <span>{chipLabel(items.filter((item) => !item.fromJira && !item.isDone).length, "project")}</span>
          <span>{chipLabel(items.filter((item) => item.fromJira && !item.isDone).length, "ops item", "ops items")}</span>
        </div>
      </div>

      <div className="calendar-track" style={{ "--week-count": weeks.length }}>
        <div className="calendar-week-grid" style={{ "--week-count": weeks.length }}>
          {weeks.map((week) => (
            <div
              key={`${member.id}-${week.index}`}
              className={`week-dropzone ${dragging ? "drop-active" : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDropItem(member.id, week.startKey)}
              title={`${member.name} · ${week.label}`}
            />
          ))}
        </div>

        <div className="calendar-items" style={{ "--week-count": weeks.length }}>
          {items.map((item) => {
            const touchedWeeks = weeksTouched(item, weeks, jiraOverrides);
            if (!touchedWeeks.length) return null;

            const firstIndex = touchedWeeks[0];
            const lastIndex = touchedWeeks[touchedWeeks.length - 1];

            return (
              <div
                key={item.id}
                className="calendar-item-shell"
                style={{
                  gridColumn: `${firstIndex + 1} / ${lastIndex + 2}`,
                }}
              >
                <AssignmentCard
                  item={item}
                  jiraOverrides={jiraOverrides}
                  onEdit={onEditItem}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                />
              </div>
            );
          })}
        </div>
      </div>
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

  const [showDone, setShowDone] = useState(false);
  const [horizonDays, setHorizonDays] = useState(DEFAULT_HORIZON);
  const [visibleMemberIds, setVisibleMemberIds] = useState(TEAM_MEMBERS.map((member) => member.id));
  const [selectedJiraStatuses, setSelectedJiraStatuses] = useState([]);
  const [jiraOverrides, setJiraOverrides] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(JIRA_OVERRIDE_STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  });
  const [draggingId, setDraggingId] = useState(null);

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [taskForm, setTaskForm] = useState({
    title: "",
    memberId: TEAM_MEMBERS[0].id,
    startKey: TODAY_KEY,
    endKey: dateKey(addDays(TODAY, 4)),
  });

  const nextId = useRef(300);
  const saveTimer = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(JIRA_OVERRIDE_STORAGE_KEY, JSON.stringify(jiraOverrides));
    } catch {
      // ignore local storage issues
    }
  }, [jiraOverrides]);

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

    async function loadData() {
      setLoading(true);
      try {
        const manualAssignments = await fetchManualAssignments();
        const jiraAssignments = await fetchJiraAssignments();
        const merged = [...manualAssignments, ...jiraAssignments];

        if (!cancelled) {
          setAssignments(merged);
          await persistAssignments(manualAssignments, setSaveStatus);
        }
      } catch (error) {
        console.error("Initial load failed", error);
        if (!cancelled) setSyncStatus({ type: "error", message: error.message || "Unable to load team assignments and Jira items." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
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
      const next = current.filter((status) => availableJiraStatuses.includes(status));
      return next.length ? next : availableJiraStatuses;
    });
  }, [availableJiraStatuses]);

  const weekColumns = useMemo(() => buildWeekColumns(horizonDays), [horizonDays]);
  const horizonStartKey = weekColumns[0]?.startKey || TODAY_KEY;
  const horizonEndKey = weekColumns[weekColumns.length - 1]?.endKey || TODAY_KEY;

  const filteredAssignments = useMemo(() => {
    return assignments.filter((item) => {
      if (!visibleMemberIds.includes(item.memberId)) return false;
      if (!showDone && item.isDone) return false;
      if (item.fromJira && selectedJiraStatuses.length && !selectedJiraStatuses.includes(item.status || "")) return false;

      const timeline = itemTimeline(item, jiraOverrides);
      return timeline.startKey <= horizonEndKey && timeline.endKey >= horizonStartKey;
    });
  }, [assignments, horizonEndKey, horizonStartKey, jiraOverrides, selectedJiraStatuses, showDone, visibleMemberIds]);

  const stats = useMemo(() => {
    const visible = filteredAssignments.filter((item) => !item.isDone);
    return {
      planned: visible.filter((item) => !item.fromJira).length,
      ops: visible.filter((item) => item.fromJira).length,
      people: visibleMemberIds.length,
      overdue: visible.filter((item) => item.fromJira && item.dueDateKey && item.dueDateKey < TODAY_KEY).length,
    };
  }, [filteredAssignments, visibleMemberIds.length]);

  const teamRows = useMemo(() => {
    return TEAM_MEMBERS.filter((member) => visibleMemberIds.includes(member.id)).map((member) => ({
      member,
      items: filteredAssignments
        .filter((item) => item.memberId === member.id)
        .sort((a, b) => {
          const aStart = itemTimeline(a, jiraOverrides).startKey;
          const bStart = itemTimeline(b, jiraOverrides).startKey;
          return aStart.localeCompare(bStart);
        }),
    }));
  }, [filteredAssignments, jiraOverrides, visibleMemberIds]);

  const opsBacklog = useMemo(() => {
    return assignments
      .filter((item) => item.fromJira && !item.isDone)
      .filter((item) => !selectedJiraStatuses.length || selectedJiraStatuses.includes(item.status || ""))
      .sort((a, b) => {
        const aKey = itemTimeline(a, jiraOverrides).startKey;
        const bKey = itemTimeline(b, jiraOverrides).startKey;
        return aKey.localeCompare(bKey);
      });
  }, [assignments, jiraOverrides, selectedJiraStatuses]);

  function scheduleManualPersist(nextAssignments) {
    const manualOnly = nextAssignments.filter((item) => !item.fromJira);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => persistAssignments(manualOnly, setSaveStatus), 400);
  }

  function updateAssignments(updater) {
    setAssignments((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      scheduleManualPersist(next);
      return next;
    });
  }

  function openNewTask(memberId = TEAM_MEMBERS[0].id) {
    setEditingAssignment(null);
    setTaskForm({
      title: "",
      memberId,
      startKey: TODAY_KEY,
      endKey: dateKey(addDays(TODAY, 4)),
    });
    setShowTaskModal(true);
  }

  function openTask(item) {
    const timeline = itemTimeline(item, jiraOverrides);
    setEditingAssignment(item);
    setTaskForm({
      title: item.title,
      memberId: item.memberId,
      startKey: timeline.startKey,
      endKey: timeline.endKey,
    });
    setShowTaskModal(true);
  }

  function saveTask() {
    if (!taskForm.title.trim() || taskForm.endKey < taskForm.startKey) return;

    if (editingAssignment) {
      if (editingAssignment.fromJira) {
        setJiraOverrides((current) => ({
          ...current,
          [editingAssignment.id]: {
            startKey: taskForm.startKey,
            endKey: taskForm.endKey,
          },
        }));
        updateAssignments((current) =>
          current.map((item) =>
            item.id === editingAssignment.id ? { ...item, title: taskForm.title.trim(), memberId: Number(taskForm.memberId) } : item
          )
        );
      } else {
        updateAssignments((current) =>
          current.map((item) =>
            item.id === editingAssignment.id
              ? {
                  ...item,
                  title: taskForm.title.trim(),
                  memberId: Number(taskForm.memberId),
                  startKey: taskForm.startKey,
                  endKey: taskForm.endKey,
                }
              : item
          )
        );
      }
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
          status: "Planned",
          dueDateKey: null,
          resolvedKey: null,
          isDone: false,
        },
      ]);
    }

    setShowTaskModal(false);
  }

  function deleteTask(item) {
    if (item.fromJira) {
      setJiraOverrides((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      updateAssignments((current) => current.filter((entry) => entry.id !== item.id));
    } else {
      updateAssignments((current) => current.filter((entry) => entry.id !== item.id));
    }
    setShowTaskModal(false);
  }

  function toggleMember(memberId) {
    setVisibleMemberIds((current) => {
      if (current.includes(memberId)) return current.filter((id) => id !== memberId);
      return [...current, memberId];
    });
  }

  function handleDragStart(event, item) {
    setDraggingId(item.id);
    event.dataTransfer.setData("text/plain", item.id);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragEnd() {
    setDraggingId(null);
  }

  function handleDropItem(memberId, weekStartKey) {
    if (!draggingId) return;

    const item = assignments.find((entry) => entry.id === draggingId);
    if (!item) {
      setDraggingId(null);
      return;
    }

    const timeline = itemTimeline(item, jiraOverrides);
    const duration = diffDaysInclusive(timeline.startKey, timeline.endKey);
    const nextEndKey = dateKey(addDays(parseDate(weekStartKey), duration - 1));

    if (item.fromJira) {
      setJiraOverrides((current) => ({
        ...current,
        [item.id]: { startKey: weekStartKey, endKey: nextEndKey },
      }));
      setAssignments((current) => current.map((entry) => (entry.id === item.id ? { ...entry, memberId } : entry)));
    } else {
      updateAssignments((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? {
                ...entry,
                memberId,
                startKey: weekStartKey,
                endKey: nextEndKey,
              }
            : entry
        )
      );
    }

    setDraggingId(null);
  }

  async function syncFromJira() {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const manualAssignments = assignments.filter((item) => !item.fromJira);
      const jiraAssignments = await fetchJiraAssignments();
      setAssignments([...manualAssignments, ...jiraAssignments]);
      scheduleManualPersist(manualAssignments);
      setSyncStatus({
        type: "success",
        message: `Synced ${jiraAssignments.filter((item) => !item.isDone).length} active Jira items and preserved manual project blocks.`,
      });
    } catch (error) {
      console.error("Jira sync failed", error);
      setSyncStatus({ type: "error", message: error.message || "Sync failed. Check Jira environment variables and token." });
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
          <p>Use the application credentials to open the executive calendar, drag/drop assignments, and review Jira operational load.</p>
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
          <span className="pm-badge">Executive team calendar</span>
          <h1>Weekly delivery calendar for your team</h1>
          <p>
            Block off people by week, drag assignments across the next 30, 60, or 90 days, and blend planned project work with Jira operational demand.
          </p>
        </div>
        <div className="pm-actions">
          <SaveStatus status={saveStatus} />
          <button className="ghost-button" onClick={handleLogout}>
            Log out
          </button>
          <button className="ghost-button" onClick={() => setShowDone((current) => !current)}>
            {showDone ? "Hide completed" : "Show completed"}
          </button>
          <button className="primary-button" onClick={() => openNewTask()}>
            Add assignment
          </button>
          <button className="sync-button" onClick={syncFromJira} disabled={syncing}>
            {syncing ? "Syncing Jira..." : "Sync Jira"}
          </button>
        </div>
      </header>

      {syncStatus ? <div className={`pm-banner ${syncStatus.type}`}>{syncStatus.message}</div> : null}

      <section className="pm-stats">
        <StatCard label="Visible team members" value={stats.people} detail="People included in the current executive view" />
        <StatCard label="Planned assignments" value={stats.planned} detail="Project blocks scheduled inside the selected horizon" />
        <StatCard label="Jira operational items" value={stats.ops} detail="Operational demand currently visible from Jira" />
        <StatCard label="Overdue operational items" value={stats.overdue} detail="Active Jira work that is already past due" />
      </section>

      <section className="control-panel">
        <div className="control-group">
          <span className="control-label">Planning window</span>
          <div className="chip-row">
            {HORIZON_OPTIONS.map((option) => (
              <FilterChip key={option} active={horizonDays === option} label={`${option} days`} onClick={() => setHorizonDays(option)} />
            ))}
          </div>
        </div>

        <div className="control-group">
          <span className="control-label">Team filter</span>
          <div className="chip-row">
            <FilterChip
              active={visibleMemberIds.length === TEAM_MEMBERS.length}
              label="All team members"
              onClick={() => setVisibleMemberIds(TEAM_MEMBERS.map((member) => member.id))}
            />
            {TEAM_MEMBERS.map((member) => (
              <button
                key={member.id}
                className={`member-chip ${visibleMemberIds.includes(member.id) ? "active" : ""}`}
                style={{ "--chip-accent": member.color }}
                onClick={() => toggleMember(member.id)}
              >
                {member.name}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <span className="control-label">Jira status filter</span>
          <div className="chip-row">
            <FilterChip active={selectedJiraStatuses.length === availableJiraStatuses.length} label="All statuses" onClick={() => setSelectedJiraStatuses(availableJiraStatuses)} />
            {availableJiraStatuses.map((status) => (
              <FilterChip
                key={status}
                active={selectedJiraStatuses.includes(status)}
                label={status}
                onClick={() =>
                  setSelectedJiraStatuses((current) =>
                    current.includes(status) ? current.filter((entry) => entry !== status) : [...current, status]
                  )
                }
              />
            ))}
          </div>
        </div>
      </section>

      <section className="calendar-panel">
          <div className="calendar-panel-head">
          <div>
            <div className="section-eyebrow">Resource calendar</div>
            <h2>Weekly capacity map</h2>
            <p>Drag any block onto another team member or week to reschedule it. Jira items keep syncing, and their calendar placement stays locally mapped for planning.</p>
          </div>
          <WorkloadLegend />
        </div>

        <div className="calendar-shell">
          <div className="calendar-header-spacer" />
          <div className="calendar-header" style={{ "--week-count": weekColumns.length }}>
            {weekColumns.map((week) => (
              <div key={week.index} className="calendar-week-header">
                <span>{week.label}</span>
                <strong>{week.shortLabel}</strong>
              </div>
            ))}
          </div>

          {loading ? (
            <section className="loading-panel inset">
              <div className="spinner" />
              <p>Loading delivery data and Jira work...</p>
            </section>
          ) : (
            teamRows.map(({ member, items }) => (
              <TeamCalendarRow
                key={member.id}
                member={member}
                weeks={weekColumns}
                items={items}
                jiraOverrides={jiraOverrides}
                dragging={Boolean(draggingId)}
                onDropItem={handleDropItem}
                onEditItem={openTask}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            ))
          )}
        </div>
      </section>

      <section className="ops-panel">
        <div className="section-headline">
          <div>
            <div className="section-eyebrow">Operational detail</div>
            <h2>Jira work feeding the calendar</h2>
          </div>
        </div>
        <div className="ops-grid">
          {opsBacklog.length ? (
            opsBacklog.map((item) => {
              const owner = findMember(item.memberId);
              const timeline = itemTimeline(item, jiraOverrides);
              return (
                <div key={item.id} className="ops-ticket" style={{ "--card-accent": owner?.color || "#475569" }}>
                  <div className="ops-ticket-head">
                    <span>{item.jiraKey}</span>
                    <span>{owner?.name || "Unassigned"}</span>
                  </div>
                  <button className="ops-ticket-title" onClick={() => openTask(item)}>
                    <strong>{item.title}</strong>
                  </button>
                  <p>{item.status || "Operational"}</p>
                  <div className="ops-ticket-meta">
                    <span>{fmtRange(timeline.startKey, timeline.endKey)}</span>
                    {item.jiraKey ? (
                      <a
                        href={`${JIRA_BASE}/${item.jiraKey}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Open in Jira
                      </a>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="empty-copy">No Jira operational items match the current filters.</p>
          )}
        </div>
      </section>

      {showTaskModal ? (
        <div className="modal-backdrop" onClick={() => setShowTaskModal(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="section-eyebrow">{editingAssignment?.fromJira ? "Jira assignment" : "Planned assignment"}</div>
                <h3>{editingAssignment ? "Edit assignment" : "New assignment"}</h3>
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
              <span>Team member</span>
              <select value={taskForm.memberId} onChange={(event) => setTaskForm((current) => ({ ...current, memberId: Number(event.target.value) }))}>
                {TEAM_MEMBERS.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} - {member.role}
                  </option>
                ))}
              </select>
            </label>

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

            {editingAssignment?.jiraKey ? (
              <a className="link-button" href={`${JIRA_BASE}/${editingAssignment.jiraKey}`} target="_blank" rel="noreferrer">
                Open {editingAssignment.jiraKey} in Jira
              </a>
            ) : null}

            <div className="modal-actions">
              {editingAssignment ? (
                <button className="danger-button" onClick={() => deleteTask(editingAssignment)}>
                  {editingAssignment.fromJira ? "Remove from local plan" : "Delete"}
                </button>
              ) : null}
              <button className="primary-button" onClick={saveTask}>
                {editingAssignment ? "Save changes" : "Add assignment"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function fetchManualAssignments() {
  const response = await fetch("/api/assignments");
  const stored = await response.json();
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

  return savedAssignments.filter((item) => !item.fromJira);
}

async function fetchJiraAssignments() {
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

  const activeData = await activeResponse.json().catch(() => ({}));
  const doneData = await doneResponse.json().catch(() => ({}));

  if (!activeResponse.ok) {
    throw new Error(activeData.error || "Active Jira sync failed.");
  }

  if (!doneResponse.ok) {
    throw new Error(doneData.error || "Completed Jira sync failed.");
  }

  const mapIssue = (issue, isDone) => {
    const { summary, assignee, duedate } = issue.fields;
    const member = findMemberByAssignee(assignee);
    if (!member) return null;

    const dueDateKey = duedate ? dateKey(parseDate(duedate)) : null;
    const resolved = issue.fields.transitionDate || issue.fields.resolutiondate;

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
      resolvedKey: resolved ? dateKey(new Date(resolved)) : null,
      isDone,
    };
  };

  return [
    ...(activeData.issues || []).map((issue) => mapIssue(issue, false)),
    ...(doneData.issues || []).map((issue) => mapIssue(issue, true)),
  ].filter(Boolean);
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
    window.setTimeout(() => setSaveStatus(null), 1800);
  } catch (error) {
    console.error("Persist failed", error);
    setSaveStatus("error");
  }
}
