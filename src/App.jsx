import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const TEAM_MEMBERS = [
  { id: 1, name: "Ryan Geraghty", role: "Director, Software Development", color: "#0f766e", initials: "RG", jiraAliases: ["ryan geraghty", "ryan"] },
  { id: 2, name: "Michael Santilli", role: "Sr. Web Developer", color: "#2563eb", initials: "MS", jiraAliases: ["michael santilli", "michael", "mike santilli", "mike"] },
  { id: 3, name: "John Kaeser", role: "Sr. Developer", color: "#c2410c", initials: "JK", jiraAliases: ["john kaeser", "john"] },
  { id: 4, name: "Jason Moore", role: "Web Developer", color: "#7c3aed", initials: "JM", jiraAliases: ["jason moore", "jason"] },
];

const HORIZON_OPTIONS = [28, 42, 56, 84];
const DEFAULT_HORIZON = 28;
const ACTIVE_JIRA_JQL = 'issuetype IN ("[System] Incident", "[System] Service request", Story, "Sub-task", Task, Bug) AND project != ITDS ORDER BY priority DESC, due ASC';
const DONE_JIRA_JQL = 'statusCategory = Done AND assignee is not EMPTY AND resolutiondate >= -45d ORDER BY resolutiondate DESC';
const JIRA_BASE = "https://hmpglobal.atlassian.net/browse";

const PROJECTS_STORAGE_KEY = "teamPlannerProjectsV2";
const PRIORITIES_STORAGE_KEY = "teamPlannerPrioritiesV1";
const LEGACY_IMPORT_KEY = "teamPlannerImportedLegacyAssignments";

const TODAY = startOfDay(new Date());
const TODAY_KEY = dateKey(TODAY);

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

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

function diffDays(startKey, endKey) {
  return Math.round((parseDate(endKey) - parseDate(startKey)) / 86400000);
}

function clampDateRange(startKey, endKey) {
  if (!startKey && !endKey) return { startKey: TODAY_KEY, endKey: TODAY_KEY };
  if (!startKey) return { startKey: endKey, endKey };
  if (!endKey) return { startKey, endKey: startKey };
  if (endKey < startKey) return { startKey: endKey, endKey: startKey };
  return { startKey, endKey };
}

function formatDate(key, options = { month: "short", day: "numeric" }) {
  if (!key) return "Unscheduled";
  return parseDate(key).toLocaleDateString("en-US", options);
}

function formatRange(startKey, endKey) {
  if (!startKey && !endKey) return "No dates";
  if (!endKey || startKey === endKey) return formatDate(startKey || endKey);
  return `${formatDate(startKey)} - ${formatDate(endKey)}`;
}

function getMonthLabel(key) {
  return parseDate(key).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function normalizeName(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function readLocalStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function findMember(memberId) {
  return TEAM_MEMBERS.find((member) => member.id === memberId) || null;
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

function buildDayColumns(anchorDate, days) {
  const startDate = startOfDay(anchorDate);
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(startDate, index);
    return {
      index,
      key: dateKey(date),
      dayLabel: date.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 1),
      dateLabel: date.toLocaleDateString("en-US", { day: "numeric" }),
    };
  });
}

function buildMonthGroups(dayColumns) {
  const groups = [];
  dayColumns.forEach((column, index) => {
    const label = getMonthLabel(column.key);
    const previous = groups.at(-1);
    if (!previous || previous.label !== label) {
      groups.push({ label, start: index, span: 1 });
    } else {
      previous.span += 1;
    }
  });
  return groups;
}

function overlapsHorizon(startKey, endKey, horizonStartKey, horizonEndKey) {
  if (!startKey && !endKey) return true;
  const range = clampDateRange(startKey, endKey);
  return range.startKey <= horizonEndKey && range.endKey >= horizonStartKey;
}

function getSpan(startKey, endKey, horizonStartKey, horizonEndKey) {
  const range = clampDateRange(startKey, endKey);
  const clampedStart = range.startKey < horizonStartKey ? horizonStartKey : range.startKey;
  const clampedEnd = range.endKey > horizonEndKey ? horizonEndKey : range.endKey;
  const start = diffDays(horizonStartKey, clampedStart) + 1;
  const end = diffDays(horizonStartKey, clampedEnd) + 2;
  return { start, end };
}

function statusTone(status) {
  const value = (status || "").toLowerCase();
  if (value.includes("risk")) return "risk";
  if (value.includes("hold")) return "risk";
  if (value.includes("done")) return "done";
  if (value.includes("complete")) return "done";
  if (value.includes("plan")) return "planned";
  if (value.includes("active")) return "active";
  if (value.includes("progress")) return "active";
  return "planned";
}

function priorityLabel(priority) {
  if (priority === "high") return "^";
  if (priority === "low") return "v";
  return "-";
}

function emptyProjectForm() {
  return {
    title: "",
    ownerId: TEAM_MEMBERS[0].id,
    startKey: TODAY_KEY,
    endKey: dateKey(addDays(TODAY, 45)),
    status: "In progress",
    summary: "",
  };
}

function emptyPriorityForm() {
  return {
    title: "",
    priority: "medium",
    ownerId: "",
    targetKey: "",
    summary: "",
  };
}

function emptyMilestoneForm(projectId = "") {
  return {
    projectId,
    title: "",
    assigneeId: "",
    dueKey: dateKey(addDays(TODAY, 14)),
    doneKey: "",
    status: "Due",
  };
}

function chipLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatWindowLabel(startKey, endKey) {
  return `${parseDate(startKey).toLocaleDateString("en-US", { month: "long", year: "numeric" })} · ${formatDate(startKey, {
    month: "short",
    day: "numeric",
  })} → ${formatDate(endKey, { month: "short", day: "numeric" })}`;
}

function inferJiraWindow(item) {
  const fallbackStart = item.createdKey || item.dueDateKey || TODAY_KEY;
  const fallbackEnd = item.resolvedKey || item.dueDateKey || fallbackStart;
  const range = clampDateRange(fallbackStart, fallbackEnd);
  return {
    startKey: item.isDone && !item.dueDateKey ? range.startKey : range.startKey,
    endKey: item.isDone ? range.endKey : clampDateRange(range.startKey, item.dueDateKey || range.endKey).endKey,
  };
}

function legacyAssignmentsToProjects(assignments) {
  return assignments.map((item, index) => ({
    id: `project-import-${index + 1}`,
    title: item.title,
    ownerId: item.memberId || TEAM_MEMBERS[0].id,
    startKey: item.startKey || item.dueDateKey || TODAY_KEY,
    endKey: item.endKey || item.dueDateKey || item.startKey || TODAY_KEY,
    status: item.isDone ? "Done" : "Imported",
    summary: "Imported from the previous planner view.",
    expanded: true,
    deliverables: [
      {
        id: `milestone-import-${index + 1}`,
        title: item.title,
        assigneeId: item.memberId || null,
        dueKey: item.endKey || item.dueDateKey || item.startKey || TODAY_KEY,
        doneKey: item.isDone ? item.resolvedKey || item.endKey || item.startKey || TODAY_KEY : "",
        status: item.isDone ? "Done" : "Due",
      },
    ],
  }));
}

function normalizeProjects(list) {
  return (Array.isArray(list) ? list : []).map((project) => ({
    ...project,
    ownerId: project.ownerId || TEAM_MEMBERS[0].id,
    expanded: project.expanded ?? true,
    deliverables: Array.isArray(project.deliverables) ? project.deliverables : [],
  }));
}

function normalizePriorities(list) {
  return Array.isArray(list) ? list : [];
}

function SaveStatus({ status }) {
  if (!status) return null;
  const labels = {
    saving: "Saving local plan",
    saved: "Plan saved locally",
    error: "Local save failed",
  };
  return <span className={`save-status ${status}`}>{labels[status]}</span>;
}

function StatCard({ label, value, detail }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function FilterChip({ active, onClick, label }) {
  return (
    <button className={`filter-chip ${active ? "active" : ""}`} onClick={onClick}>
      {label}
    </button>
  );
}

function PriorityBadge({ priority }) {
  return <span className={`priority-badge ${priority}`}>{priorityLabel(priority)}</span>;
}

function AuthScreen({ authConfigured, loginForm, setLoginForm, loginError, loginSubmitting, onLogin }) {
  return (
    <div className="pm-app auth-app">
      <section className="auth-card">
        <div className="pm-badge">Secure access</div>
        <h1>Executive project calendar</h1>
        <p>Review strategic projects, synced Jira operations, and the team’s next priorities in one horizontal planning view.</p>
        {!authConfigured ? (
          <div className="auth-warning">
            `APP_LOGIN_USER` and `APP_LOGIN_PASSWORD` are not configured, so the app cannot validate a login yet.
          </div>
        ) : null}
        <form className="auth-form" onSubmit={onLogin}>
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

function TimelineScale({ dayColumns, monthGroups }) {
  return (
    <div className="timeline-scale">
      <div className="timeline-scale-months" style={{ "--day-count": dayColumns.length }}>
        {monthGroups.map((group) => (
          <div
            key={`${group.label}-${group.start}`}
            className="timeline-month"
            style={{ gridColumn: `${group.start + 1} / span ${group.span}` }}
          >
            {group.label}
          </div>
        ))}
      </div>
      <div className="timeline-scale-days" style={{ "--day-count": dayColumns.length }}>
        {dayColumns.map((column) => (
          <div key={column.key} className={`timeline-day ${column.key === TODAY_KEY ? "today" : ""}`}>
            <span>{column.dayLabel}</span>
            <strong>{column.dateLabel}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function computeMemberStacks(blocks) {
  const ordered = [...blocks].sort((a, b) => {
    if (a.startKey !== b.startKey) return a.startKey.localeCompare(b.startKey);
    const aDuration = diffDays(a.startKey, a.endKey);
    const bDuration = diffDays(b.startKey, b.endKey);
    return bDuration - aDuration;
  });

  const laneEndByIndex = [];
  return ordered.map((block) => {
    let lane = 0;
    while (lane < laneEndByIndex.length && block.startKey <= laneEndByIndex[lane]) {
      lane += 1;
    }
    laneEndByIndex[lane] = block.endKey;
    return { ...block, lane: lane + 1 };
  });
}

function TeamBoardRow({ member, blocks, dayCount, horizonStartKey, horizonEndKey, onOpenProject, onOpenMilestone }) {
  const stacked = computeMemberStacks(blocks);
  const laneCount = Math.max(1, stacked.reduce((max, block) => Math.max(max, block.lane), 1));

  return (
    <div className="board-row" style={{ "--lane-count": laneCount }}>
      <div className="board-member">
        <div className="member-dot" style={{ background: member.color }} />
        <div className="member-copy">
          <strong>{member.name.split(" ")[0]}</strong>
          <span>{chipLabel(blocks.length, "visible block")}</span>
        </div>
      </div>
      <div className="board-track">
        <div className="board-grid" style={{ "--day-count": dayCount, "--lane-count": laneCount }}>
          {stacked.map((block) => {
            const span = getSpan(block.startKey, block.endKey, horizonStartKey, horizonEndKey);
            return (
              <button
                key={block.id}
                className={`board-block ${block.kind} ${block.compact ? "compact" : ""}`}
                style={{
                  gridColumn: `${span.start} / ${span.end}`,
                  gridRow: block.lane,
                  "--block-color": member.color,
                }}
                title={`${block.title} · ${formatRange(block.startKey, block.endKey)}`}
                onClick={() => {
                  if (block.kind === "project") onOpenProject(block.project);
                  if (block.kind === "milestone") onOpenMilestone(block.projectId, block.milestone);
                  if (block.kind === "jira" && block.link) window.open(block.link, "_blank", "noopener,noreferrer");
                }}
              >
                <div className="board-block-copy">
                  <strong>{block.title}</strong>
                  {!block.compact ? <span>{block.caption}</span> : null}
                </div>
                <span className="board-block-menu">⋮</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamKeyCard({ member, count, active, onClick }) {
  return (
    <button className={`team-key-chip ${active ? "active" : ""}`} onClick={onClick}>
      <span className="team-key-dot" style={{ background: member.color }} />
      <strong>{member.name.split(" ")[0]}</strong>
      <span>{count}</span>
    </button>
  );
}

function ModalFrame({ title, eyebrow, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="section-eyebrow">{eyebrow}</div>
            <h3>{title}</h3>
          </div>
          <button className="icon-button" onClick={onClose}>
            x
          </button>
        </div>
        {children}
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

  const [projects, setProjects] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [jiraItems, setJiraItems] = useState([]);
  const [readyItems, setReadyItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);

  const [horizonDays, setHorizonDays] = useState(DEFAULT_HORIZON);
  const [anchorDate, setAnchorDate] = useState(TODAY);
  const [showDone, setShowDone] = useState(true);
  const [visibleMemberIds, setVisibleMemberIds] = useState(TEAM_MEMBERS.map((member) => member.id));
  const [priorityFilter, setPriorityFilter] = useState("all");

  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectForm, setProjectForm] = useState(emptyProjectForm());
  const [editingProjectId, setEditingProjectId] = useState(null);

  const [priorityModalOpen, setPriorityModalOpen] = useState(false);
  const [priorityForm, setPriorityForm] = useState(emptyPriorityForm());
  const [editingPriorityId, setEditingPriorityId] = useState(null);

  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState(emptyMilestoneForm());
  const [editingMilestoneId, setEditingMilestoneId] = useState(null);

  const saveTimer = useRef(null);
  const nextId = useRef(Date.now());

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const response = await fetch("/api/session");
        const data = await response.json();
        if (cancelled) return;
        setAuthConfigured(data.authConfigured);
        setAuthStatus(data.authenticated ? "authenticated" : "unauthenticated");
      } catch {
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
        const storedProjects = readLocalStorage(PROJECTS_STORAGE_KEY, []);
        const storedPriorities = readLocalStorage(PRIORITIES_STORAGE_KEY, []);

        if (!cancelled) {
          setProjects(normalizeProjects(storedProjects));
          setPriorities(normalizePriorities(storedPriorities));
        }

        const alreadyImported = localStorage.getItem(LEGACY_IMPORT_KEY) === "true";
        if (!alreadyImported && (!storedProjects || storedProjects.length === 0)) {
          try {
            const legacyAssignments = await fetchLegacyManualAssignments();
            if (!cancelled && legacyAssignments.length) {
              const imported = legacyAssignmentsToProjects(legacyAssignments);
              setProjects(normalizeProjects(imported));
              writeLocalStorage(PROJECTS_STORAGE_KEY, imported);
            }
          } finally {
            localStorage.setItem(LEGACY_IMPORT_KEY, "true");
          }
        }

        const [jiraResult, readyResult] = await Promise.all([fetchJiraAssignments(), fetchReadyToWorkOptions()]);
        if (cancelled) return;

        setJiraItems(jiraResult.items);
        setReadyItems(readyResult);
        setSyncStatus({
          type: jiraResult.stats.rawActive === 0 && jiraResult.stats.rawDone === 0 ? "error" : "success",
          message:
            jiraResult.stats.rawActive === 0 && jiraResult.stats.rawDone === 0
              ? "Jira is connected, but the current queries returned no issues. Check project scope, assignees, or permissions."
              : `Synced ${jiraResult.stats.rawActive} active and ${jiraResult.stats.rawDone} recently done Jira issues.`,
        });
        setIsHydrated(true);
      } catch (error) {
        if (!cancelled) {
          setSyncStatus({ type: "error", message: error.message || "Unable to load planner data." });
          setIsHydrated(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [authStatus]);

  useEffect(() => {
    if (authStatus !== "authenticated" || !isHydrated) return;
    setSaveStatus("saving");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const projectsSaved = writeLocalStorage(PROJECTS_STORAGE_KEY, projects);
      const prioritiesSaved = writeLocalStorage(PRIORITIES_STORAGE_KEY, priorities);
      setSaveStatus(projectsSaved && prioritiesSaved ? "saved" : "error");
      window.setTimeout(() => setSaveStatus(null), 1800);
    }, 250);

    return () => {
      window.clearTimeout(saveTimer.current);
    };
  }, [authStatus, isHydrated, priorities, projects]);

  const dayColumns = useMemo(() => buildDayColumns(anchorDate, horizonDays), [anchorDate, horizonDays]);
  const monthGroups = useMemo(() => buildMonthGroups(dayColumns), [dayColumns]);
  const horizonStartKey = dayColumns[0]?.key || TODAY_KEY;
  const horizonEndKey = dayColumns[dayColumns.length - 1]?.key || TODAY_KEY;
  const windowLabel = useMemo(() => formatWindowLabel(horizonStartKey, horizonEndKey), [horizonEndKey, horizonStartKey]);

  const visibleProjects = useMemo(() => {
    return projects
      .map((project) => ({
        ...project,
        deliverables: (project.deliverables || []).filter((item) => {
          if (!showDone && item.doneKey) return false;
          if (item.assigneeId && !visibleMemberIds.includes(item.assigneeId)) return false;
          return overlapsHorizon(project.startKey, project.endKey, horizonStartKey, horizonEndKey) || overlapsHorizon(item.dueKey, item.doneKey || item.dueKey, horizonStartKey, horizonEndKey);
        }),
      }))
      .filter((project) => {
        const matchesOwner = !project.ownerId || visibleMemberIds.includes(project.ownerId);
        const matchesTimeline = overlapsHorizon(project.startKey, project.endKey, horizonStartKey, horizonEndKey);
        return matchesOwner && (matchesTimeline || project.deliverables.length > 0);
      });
  }, [projects, showDone, visibleMemberIds, horizonStartKey, horizonEndKey]);

  const filteredPriorities = useMemo(() => {
    return priorities.filter((item) => {
      if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
      if (item.ownerId && !visibleMemberIds.includes(Number(item.ownerId))) return false;
      return true;
    });
  }, [priorities, priorityFilter, visibleMemberIds]);

  const stats = useMemo(() => {
    const allDeliverables = projects.flatMap((project) => project.deliverables || []);
    const overdueOps = jiraItems.filter((item) => !item.isDone && item.dueDateKey && item.dueDateKey < TODAY_KEY).length;
    return {
      projects: projects.length,
      milestones: allDeliverables.length,
      ops: jiraItems.filter((item) => !item.isDone).length,
      priorities: priorities.length,
      overdueOps,
    };
  }, [jiraItems, priorities.length, projects]);

  const memberCalendar = useMemo(() => {
    return TEAM_MEMBERS.filter((member) => visibleMemberIds.includes(member.id)).map((member) => {
      const projectBlocks = visibleProjects
        .filter((project) => project.ownerId === member.id)
        .map((project) => ({
          id: `project-block-${project.id}`,
          kind: "project",
          title: project.title,
          caption: formatRange(project.startKey, project.endKey),
          startKey: project.startKey,
          endKey: project.endKey,
          project,
          compact: false,
        }));

      const milestoneBlocks = visibleProjects.flatMap((project) =>
        (project.deliverables || [])
          .filter((item) => (item.assigneeId || project.ownerId) === member.id)
          .map((item) => {
            const markerKey = item.doneKey || item.dueKey;
            return {
              id: `milestone-block-${item.id}`,
              kind: "milestone",
              title: item.title,
              caption: item.doneKey ? `Done ${formatDate(item.doneKey)}` : `Due ${formatDate(item.dueKey)}`,
              startKey: markerKey,
              endKey: markerKey,
              projectId: project.id,
              milestone: item,
              compact: true,
            };
          })
      );

      const jiraBlocks = jiraItems
        .filter((item) => item.memberId === member.id)
        .filter((item) => (showDone ? true : !item.isDone))
        .map((item) => {
          const window = inferJiraWindow(item);
          return {
            id: `jira-block-${item.id}`,
            kind: "jira",
            title: item.title,
            caption: item.jiraKey,
            startKey: window.startKey,
            endKey: window.endKey,
            compact: false,
            link: `${JIRA_BASE}/${item.jiraKey}`,
          };
        });

      const blocks = [...projectBlocks, ...milestoneBlocks, ...jiraBlocks].filter((block) =>
        overlapsHorizon(block.startKey, block.endKey, horizonStartKey, horizonEndKey)
      );

      return { member, blocks };
    });
  }, [horizonEndKey, horizonStartKey, jiraItems, showDone, visibleMemberIds, visibleProjects]);

  function newId(prefix) {
    nextId.current += 1;
    return `${prefix}-${nextId.current}`;
  }

  function openProjectModal(project = null) {
    if (project) {
      setEditingProjectId(project.id);
      setProjectForm({
        title: project.title,
        ownerId: project.ownerId || TEAM_MEMBERS[0].id,
        startKey: project.startKey,
        endKey: project.endKey,
        status: project.status || "In progress",
        summary: project.summary || "",
      });
    } else {
      setEditingProjectId(null);
      setProjectForm(emptyProjectForm());
    }
    setProjectModalOpen(true);
  }

  function saveProject() {
    if (!projectForm.title.trim()) return;
    const range = clampDateRange(projectForm.startKey, projectForm.endKey);
    if (editingProjectId) {
      setProjects((current) =>
        current.map((project) =>
          project.id === editingProjectId
            ? {
                ...project,
                title: projectForm.title.trim(),
                ownerId: Number(projectForm.ownerId),
                startKey: range.startKey,
                endKey: range.endKey,
                status: projectForm.status.trim() || "In progress",
                summary: projectForm.summary.trim(),
              }
            : project
        )
      );
    } else {
      setProjects((current) => [
        {
          id: newId("project"),
          title: projectForm.title.trim(),
          ownerId: Number(projectForm.ownerId),
          startKey: range.startKey,
          endKey: range.endKey,
          status: projectForm.status.trim() || "In progress",
          summary: projectForm.summary.trim(),
          expanded: true,
          deliverables: [],
        },
        ...current,
      ]);
    }
    setProjectModalOpen(false);
  }

  function deleteProject() {
    if (!editingProjectId) return;
    setProjects((current) => current.filter((project) => project.id !== editingProjectId));
    setProjectModalOpen(false);
  }

  function openPriorityModal(item = null) {
    if (item) {
      setEditingPriorityId(item.id);
      setPriorityForm({
        title: item.title,
        priority: item.priority || "medium",
        ownerId: item.ownerId || "",
        targetKey: item.targetKey || "",
        summary: item.summary || "",
      });
    } else {
      setEditingPriorityId(null);
      setPriorityForm(emptyPriorityForm());
    }
    setPriorityModalOpen(true);
  }

  function savePriority() {
    if (!priorityForm.title.trim()) return;
    const payload = {
      title: priorityForm.title.trim(),
      priority: priorityForm.priority,
      ownerId: priorityForm.ownerId ? Number(priorityForm.ownerId) : null,
      targetKey: priorityForm.targetKey || "",
      summary: priorityForm.summary.trim(),
    };

    if (editingPriorityId) {
      setPriorities((current) => current.map((item) => (item.id === editingPriorityId ? { ...item, ...payload } : item)));
    } else {
      setPriorities((current) => [{ id: newId("priority"), ...payload }, ...current]);
    }

    setPriorityModalOpen(false);
  }

  function deletePriority() {
    if (!editingPriorityId) return;
    setPriorities((current) => current.filter((item) => item.id !== editingPriorityId));
    setPriorityModalOpen(false);
  }

  function openMilestoneModal(projectId, item = null) {
    if (item) {
      setEditingMilestoneId(item.id);
      setMilestoneForm({
        projectId,
        title: item.title,
        assigneeId: item.assigneeId || "",
        dueKey: item.dueKey || TODAY_KEY,
        doneKey: item.doneKey || "",
        status: item.status || "Due",
      });
    } else {
      setEditingMilestoneId(null);
      setMilestoneForm(emptyMilestoneForm(projectId));
    }
    setMilestoneModalOpen(true);
  }

  function saveMilestone() {
    if (!milestoneForm.projectId || !milestoneForm.title.trim()) return;
    const payload = {
      id: editingMilestoneId || newId("milestone"),
      title: milestoneForm.title.trim(),
      assigneeId: milestoneForm.assigneeId ? Number(milestoneForm.assigneeId) : null,
      dueKey: milestoneForm.dueKey || TODAY_KEY,
      doneKey: milestoneForm.doneKey || "",
      status: milestoneForm.doneKey ? "Done" : milestoneForm.status || "Due",
    };

    setProjects((current) =>
      current.map((project) => {
        if (project.id !== milestoneForm.projectId) return project;
        const deliverables = [...(project.deliverables || [])];
        const existingIndex = deliverables.findIndex((item) => item.id === payload.id);
        if (existingIndex >= 0) {
          deliverables[existingIndex] = payload;
        } else {
          deliverables.push(payload);
        }
        return { ...project, deliverables };
      })
    );

    setMilestoneModalOpen(false);
  }

  function deleteMilestone() {
    if (!editingMilestoneId || !milestoneForm.projectId) return;
    setProjects((current) =>
      current.map((project) =>
        project.id === milestoneForm.projectId
          ? { ...project, deliverables: (project.deliverables || []).filter((item) => item.id !== editingMilestoneId) }
          : project
      )
    );
    setMilestoneModalOpen(false);
  }

  async function syncFromJira() {
    setSyncing(true);
    setSyncStatus(null);
    try {
      const [jiraResult, readyResult] = await Promise.all([fetchJiraAssignments(), fetchReadyToWorkOptions()]);
      setJiraItems(jiraResult.items);
      setReadyItems(readyResult);
      setSyncStatus({
        type: jiraResult.stats.rawActive === 0 && jiraResult.stats.rawDone === 0 ? "error" : "success",
        message:
          jiraResult.stats.rawActive === 0 && jiraResult.stats.rawDone === 0
            ? "Jira connected, but no issues matched the current query."
            : `Fetched ${jiraResult.stats.rawActive} active and ${jiraResult.stats.rawDone} recently completed Jira issues.`,
      });
    } catch (error) {
      setSyncStatus({ type: "error", message: error.message || "Jira sync failed." });
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
    setAuthStatus("unauthenticated");
    setIsHydrated(false);
    setJiraItems([]);
    setReadyItems([]);
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
      <AuthScreen
        authConfigured={authConfigured}
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        loginError={loginError}
        loginSubmitting={loginSubmitting}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="pm-app">
      <header className="pm-topbar">
        <div className="pm-brand">
          <span className="pm-badge">Executive portfolio view</span>
          <h1>Team Project Calendar</h1>
        </div>
        <div className="pm-actions">
          <SaveStatus status={saveStatus} />
          <button className="ghost-button" onClick={handleLogout}>
            Log out
          </button>
          <button className="ghost-button" onClick={() => setShowDone((current) => !current)}>
            {showDone ? "Hide completed" : "Show completed"}
          </button>
          <button className="ghost-button" onClick={() => openPriorityModal()}>
            Add priority
          </button>
          <button className="primary-button" onClick={() => openProjectModal()}>
            Add project
          </button>
          <button className="sync-button" onClick={syncFromJira} disabled={syncing}>
            {syncing ? "Syncing Jira..." : "Sync Jira"}
          </button>
        </div>
      </header>

      {syncStatus ? <div className={`pm-banner ${syncStatus.type}`}>{syncStatus.message}</div> : null}

      <section className="reference-toolbar">
        <div className="toolbar-cluster">
          <button className="icon-button nav-button" onClick={() => setAnchorDate((current) => addDays(current, -7))}>
            ←
          </button>
          <button className="ghost-button today-button" onClick={() => setAnchorDate(TODAY)}>
            Today
          </button>
          <button className="icon-button nav-button" onClick={() => setAnchorDate((current) => addDays(current, 7))}>
            →
          </button>
          <select className="range-select" value={horizonDays} onChange={(event) => setHorizonDays(Number(event.target.value))}>
            {HORIZON_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option / 7} weeks
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-cluster">
          <button className="ghost-button" onClick={() => setShowDone((current) => !current)}>
            {showDone ? "Hide completed" : "Show completed"}
          </button>
          <button className="ghost-button" onClick={syncFromJira} disabled={syncing}>
            {syncing ? "Syncing..." : "Sync Jira"}
          </button>
          <button className="primary-button" onClick={() => openProjectModal()}>
            + Add assignment
          </button>
        </div>
      </section>

      <section className="reference-summary">
        <article className="summary-card">
          <div className="summary-card-head">
            <h3>Window</h3>
            <span>{`${horizonDays / 7}w • ${dayColumns.length} blocks`}</span>
          </div>
          <strong>{windowLabel}</strong>
          <p>Overlaps show as stacked lanes per teammate so project work, Jira ops, and milestone dates stay visible together.</p>
        </article>
        <article className="summary-card">
          <div className="summary-card-head">
            <h3>Team key</h3>
          </div>
          <div className="team-key-grid">
            {memberCalendar.map(({ member, blocks }) => (
              <TeamKeyCard
                key={member.id}
                member={member}
                count={blocks.length}
                active={visibleMemberIds.includes(member.id)}
                onClick={() =>
                  setVisibleMemberIds((current) =>
                    current.length === 1 && current.includes(member.id) ? TEAM_MEMBERS.map((entry) => entry.id) : [member.id]
                  )
                }
              />
            ))}
          </div>
          <p>Tip: click a name to focus on one teammate, then click again to return to the full team.</p>
        </article>
        <article className="summary-card">
          <div className="summary-card-head">
            <h3>Overlap handling</h3>
          </div>
          <strong>{`${stats.projects} projects • ${stats.ops} active ops items`}</strong>
          <p>This view keeps strategic project bars, due or done project items, and Jira work in the same teammate lane by stacking overlaps automatically.</p>
        </article>
      </section>

      <section className="board-shell">
        {loading ? (
          <section className="loading-panel inset">
            <div className="spinner" />
            <p>Loading portfolio and Jira data...</p>
          </section>
        ) : (
          <>
            <div className="board-header">
              <div className="board-header-left">
                <span>Team</span>
              </div>
              <div className="board-header-right">
                <TimelineScale dayColumns={dayColumns} monthGroups={monthGroups} />
              </div>
            </div>

            <div className="board-body">
              {memberCalendar.map(({ member, blocks }) => (
                <TeamBoardRow
                  key={member.id}
                  member={member}
                  blocks={blocks}
                  dayCount={dayColumns.length}
                  horizonStartKey={horizonStartKey}
                  horizonEndKey={horizonEndKey}
                  onOpenProject={openProjectModal}
                  onOpenMilestone={openMilestoneModal}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="dashboard-grid lower">
        <div className="portfolio-panel">
          <div className="panel-head compact">
            <div>
              <div className="section-eyebrow">Project hierarchy</div>
              <h2>Strategic roadmap</h2>
            </div>
            <div className="toolbar-cluster compact">
              <SaveStatus status={saveStatus} />
              <button className="ghost-button" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </div>

          <div className="hierarchy-list">
            {visibleProjects.length ? (
              visibleProjects.map((project) => {
                const owner = findMember(project.ownerId);
                return (
                  <article key={project.id} className="hierarchy-card">
                    <div className="hierarchy-card-head">
                      <div>
                        <button className="label-title" onClick={() => openProjectModal(project)}>
                          {project.title}
                        </button>
                        <div className="label-meta">
                          <span>{owner?.name || "No owner"}</span>
                          <span>{formatRange(project.startKey, project.endKey)}</span>
                          <span className={`tone-pill ${statusTone(project.status)}`}>{project.status}</span>
                        </div>
                      </div>
                      <button className="subtle-button" onClick={() => openMilestoneModal(project.id)}>
                        Add item
                      </button>
                    </div>
                    <p className="hierarchy-summary">{project.summary || "No executive summary added yet."}</p>
                    <div className="hierarchy-items">
                      {(project.deliverables || []).length ? (
                        project.deliverables.map((item) => (
                          <button key={item.id} className="hierarchy-item" onClick={() => openMilestoneModal(project.id, item)}>
                            <span>{item.title}</span>
                            <span>{item.doneKey ? `Done ${formatDate(item.doneKey)}` : `Due ${formatDate(item.dueKey)}`}</span>
                          </button>
                        ))
                      ) : (
                        <div className="empty-block compact">
                          <p>No due or done items yet.</p>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-block">
                <p>No projects match the current filters.</p>
                <button className="primary-button" onClick={() => openProjectModal()}>
                  Add the first project
                </button>
              </div>
            )}
          </div>
        </div>

        <aside className="sidebar-panel">
          <div className="panel-head compact">
            <div>
              <div className="section-eyebrow">Next priorities</div>
              <h2>What leadership should watch next</h2>
            </div>
            <button className="primary-button" onClick={() => openPriorityModal()}>
              Add priority
            </button>
          </div>

          <div className="chip-row">
            <FilterChip active={priorityFilter === "all"} label="All" onClick={() => setPriorityFilter("all")} />
            <FilterChip active={priorityFilter === "high"} label="High (^)" onClick={() => setPriorityFilter("high")} />
            <FilterChip active={priorityFilter === "medium"} label="Medium (-)" onClick={() => setPriorityFilter("medium")} />
            <FilterChip active={priorityFilter === "low"} label="Low (v)" onClick={() => setPriorityFilter("low")} />
          </div>

          <div className="priority-list">
            {filteredPriorities.length ? (
              filteredPriorities.map((item) => {
                const owner = findMember(item.ownerId);
                return (
                  <button key={item.id} className="priority-card" onClick={() => openPriorityModal(item)}>
                    <div className="priority-card-head">
                      <PriorityBadge priority={item.priority} />
                      <span>{item.priority}</span>
                    </div>
                    <strong>{item.title}</strong>
                    <p>{item.summary || "No additional note yet."}</p>
                    <div className="priority-card-meta">
                      <span>{owner?.name || "Owner TBD"}</span>
                      <span>{item.targetKey ? `Target ${formatDate(item.targetKey)}` : "Date TBD"}</span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="empty-block">
                <p>No priority items match the current filter.</p>
              </div>
            )}
          </div>

          <div className="panel-head compact top-gap">
            <div>
              <div className="section-eyebrow">Ready queue</div>
              <h2>Jira items already due-backed</h2>
            </div>
          </div>

          <div className="ready-list">
            {readyItems.length ? (
              readyItems.map((item) => (
                <a key={item.id} className="ready-card" href={`${JIRA_BASE}/${item.jiraKey}`} target="_blank" rel="noreferrer">
                  <div className="ready-card-head">
                    <span>{item.jiraKey}</span>
                    <span>{item.assigneeName || "Unassigned"}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.status}</p>
                  <div className="priority-card-meta">
                    <span>{item.dueDateKey ? `Due ${formatDate(item.dueDateKey, { month: "short", day: "numeric", year: "numeric" })}` : "No due date"}</span>
                  </div>
                </a>
              ))
            ) : (
              <div className="empty-block compact">
                <p>No “Ready to Work” Jira items with due dates are currently available.</p>
              </div>
            )}
          </div>
        </aside>
      </section>

      {projectModalOpen ? (
        <ModalFrame title={editingProjectId ? "Edit project" : "Add project"} eyebrow="Project" onClose={() => setProjectModalOpen(false)}>
          <label>
            <span>Project name</span>
            <input value={projectForm.title} onChange={(event) => setProjectForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>Project owner</span>
            <select value={projectForm.ownerId} onChange={(event) => setProjectForm((current) => ({ ...current, ownerId: Number(event.target.value) }))}>
              {TEAM_MEMBERS.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-grid">
            <label>
              <span>Start date</span>
              <input type="date" value={projectForm.startKey} onChange={(event) => setProjectForm((current) => ({ ...current, startKey: event.target.value }))} />
            </label>
            <label>
              <span>End date</span>
              <input type="date" value={projectForm.endKey} onChange={(event) => setProjectForm((current) => ({ ...current, endKey: event.target.value }))} />
            </label>
          </div>
          <label>
            <span>Status</span>
            <input value={projectForm.status} onChange={(event) => setProjectForm((current) => ({ ...current, status: event.target.value }))} />
          </label>
          <label>
            <span>Executive summary</span>
            <textarea value={projectForm.summary} onChange={(event) => setProjectForm((current) => ({ ...current, summary: event.target.value }))} rows={4} />
          </label>
          <div className="modal-actions">
            {editingProjectId ? (
              <button className="danger-button" onClick={deleteProject}>
                Delete project
              </button>
            ) : null}
            <button className="primary-button" onClick={saveProject}>
              {editingProjectId ? "Save changes" : "Create project"}
            </button>
          </div>
        </ModalFrame>
      ) : null}

      {priorityModalOpen ? (
        <ModalFrame title={editingPriorityId ? "Edit priority" : "Add priority"} eyebrow="Next priority" onClose={() => setPriorityModalOpen(false)}>
          <label>
            <span>Priority title</span>
            <input value={priorityForm.title} onChange={(event) => setPriorityForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>Priority level</span>
            <select value={priorityForm.priority} onChange={(event) => setPriorityForm((current) => ({ ...current, priority: event.target.value }))}>
              <option value="high">High (^)</option>
              <option value="medium">Medium (-)</option>
              <option value="low">Low (v)</option>
            </select>
          </label>
          <div className="modal-grid">
            <label>
              <span>Owner</span>
              <select value={priorityForm.ownerId} onChange={(event) => setPriorityForm((current) => ({ ...current, ownerId: event.target.value }))}>
                <option value="">TBD</option>
                {TEAM_MEMBERS.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Target date</span>
              <input type="date" value={priorityForm.targetKey} onChange={(event) => setPriorityForm((current) => ({ ...current, targetKey: event.target.value }))} />
            </label>
          </div>
          <label>
            <span>Context note</span>
            <textarea value={priorityForm.summary} onChange={(event) => setPriorityForm((current) => ({ ...current, summary: event.target.value }))} rows={4} />
          </label>
          <div className="modal-actions">
            {editingPriorityId ? (
              <button className="danger-button" onClick={deletePriority}>
                Delete priority
              </button>
            ) : null}
            <button className="primary-button" onClick={savePriority}>
              {editingPriorityId ? "Save changes" : "Add priority"}
            </button>
          </div>
        </ModalFrame>
      ) : null}

      {milestoneModalOpen ? (
        <ModalFrame title={editingMilestoneId ? "Edit project item" : "Add project item"} eyebrow="Due or done item" onClose={() => setMilestoneModalOpen(false)}>
          <label>
            <span>Item title</span>
            <input value={milestoneForm.title} onChange={(event) => setMilestoneForm((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            <span>Assignee</span>
            <select value={milestoneForm.assigneeId} onChange={(event) => setMilestoneForm((current) => ({ ...current, assigneeId: event.target.value }))}>
              <option value="">Unassigned</option>
              {TEAM_MEMBERS.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-grid">
            <label>
              <span>Due date</span>
              <input type="date" value={milestoneForm.dueKey} onChange={(event) => setMilestoneForm((current) => ({ ...current, dueKey: event.target.value }))} />
            </label>
            <label>
              <span>Done date</span>
              <input type="date" value={milestoneForm.doneKey} onChange={(event) => setMilestoneForm((current) => ({ ...current, doneKey: event.target.value }))} />
            </label>
          </div>
          <div className="modal-actions">
            {editingMilestoneId ? (
              <button className="danger-button" onClick={deleteMilestone}>
                Delete item
              </button>
            ) : null}
            <button className="primary-button" onClick={saveMilestone}>
              {editingMilestoneId ? "Save changes" : "Add item"}
            </button>
          </div>
        </ModalFrame>
      ) : null}
    </div>
  );
}

async function fetchLegacyManualAssignments() {
  const response = await fetch("/api/assignments");
  if (!response.ok) return [];
  const stored = await response.json().catch(() => []);

  return Array.isArray(stored)
    ? stored
        .map((row) => ({
          id: row.id,
          title: row.title,
          memberId: row.member_id,
          startKey: row.start_key,
          endKey: row.end_key,
          dueDateKey: row.due_date_key,
          resolvedKey: row.resolved_key,
          isDone: row.is_done,
          fromJira: row.from_jira,
        }))
        .filter((item) => !item.fromJira)
    : [];
}

async function fetchJiraAssignments() {
  const [activeResponse, doneResponse] = await Promise.all([
    fetch(`/api/jira?jql=${encodeURIComponent(ACTIVE_JIRA_JQL)}`),
    fetch(`/api/jira?jql=${encodeURIComponent(DONE_JIRA_JQL)}`),
  ]);

  const activeData = await activeResponse.json().catch(() => ({}));
  const doneData = await doneResponse.json().catch(() => ({}));

  if (!activeResponse.ok) throw new Error(activeData.error || "Active Jira sync failed.");
  if (!doneResponse.ok) throw new Error(doneData.error || "Completed Jira sync failed.");

  const mapIssue = (issue, isDone) => {
    const member = findMemberByAssignee(issue.fields.assignee);
    if (!member) return null;

    return {
      id: `jira-${issue.id}`,
      jiraKey: issue.key,
      title: issue.fields.summary,
      status: issue.fields.status?.name || "",
      memberId: member.id,
      dueDateKey: issue.fields.duedate || "",
      createdKey: issue.fields.created ? dateKey(new Date(issue.fields.created)) : "",
      resolvedKey: issue.fields.transitionDate ? dateKey(new Date(issue.fields.transitionDate)) : issue.fields.resolutiondate ? dateKey(new Date(issue.fields.resolutiondate)) : "",
      isDone,
    };
  };

  const activeMapped = (activeData.issues || []).map((issue) => mapIssue(issue, false)).filter(Boolean);
  const doneMapped = (doneData.issues || []).map((issue) => mapIssue(issue, true)).filter(Boolean);

  return {
    items: [...activeMapped, ...doneMapped],
    stats: {
      rawActive: (activeData.issues || []).length,
      rawDone: (doneData.issues || []).length,
    },
  };
}

async function fetchReadyToWorkOptions() {
  const response = await fetch("/api/jira?view=readyDue");
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Unable to load Ready to Work Jira items.");

  return (data.issues || []).map((issue) => ({
    id: `ready-${issue.id}`,
    jiraKey: issue.key,
    title: issue.fields.summary,
    assigneeName: issue.fields.assignee?.displayName || "",
    dueDateKey: issue.fields.duedate || "",
    status: issue.fields.status?.name || "Ready to Work",
  }));
}
