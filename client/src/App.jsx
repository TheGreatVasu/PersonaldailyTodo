import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { AppDataProvider, useAppData } from "./AppDataContext.jsx";
import { useSettings } from "./SettingsContext.jsx";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import { ThemeProvider } from "./ThemeContext.jsx";
import { ThemeToggle } from "./ThemeToggle.jsx";
import { SettingsProvider } from "./SettingsContext.jsx";
import LoginPage from "./LoginPage.jsx";
import AboutPage from "./AboutPage.jsx";
import WeekViewPage from "./WeekViewPage.jsx";
import SettingsPage from "./SettingsPage.jsx";
import {
  collectTagsFromTodos,
  filterTodosByTag,
  sortTodosByDbOrder,
  sortTodosForDisplay,
} from "./todoUtils.js";
import {
  completionBurst,
  completionConfettiBurst,
  createComboTracker,
  pickComboPraise,
  pickPraise,
  playCompletionChime,
  prefersReducedMotion,
} from "./completionGame.js";
import "./App.css";

const ReportPage = lazy(() => import("./ReportPage.jsx"));

function navLinkClass({ isActive }) {
  return `nav-link${isActive ? " nav-link-active" : ""}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Local calendar YYYY-MM-DD (matches the date picker). */
function localCalendarISO() {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseTagsFromInput(s) {
  const raw = String(s ?? "").trim();
  if (!raw) return [];
  const parts = raw.split(/[,\s]+/);
  const out = [];
  for (const p of parts) {
    const t = p.replace(/^#/, "").trim().toLowerCase();
    if (t && /^[\w-]+$/.test(t)) out.push(t);
  }
  return [...new Set(out)];
}

function AppNavbar() {
  const { token, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <div className="nav-sticky">
      {menuOpen && (
        <div
          className="nav-backdrop"
          role="presentation"
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="nav-shell">
        <nav className="nav-cylinder" aria-label="Main navigation">
          <div className="nav-inner">
            <Link
              className="nav-brand"
              to="/"
              onClick={() => {
                setMenuOpen(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              Daily To-Do List
            </Link>
            <div className="nav-center nav-links-desktop">
              {token ? (
                <>
                  <NavLink to="/report" className={navLinkClass}>
                    Report
                  </NavLink>
                  <NavLink to="/week" className={navLinkClass}>
                    Week
                  </NavLink>
                  <NavLink to="/" end className={navLinkClass}>
                    Daily
                  </NavLink>
                  <NavLink to="/settings" className={navLinkClass}>
                    Settings
                  </NavLink>
                </>
              ) : (
                <NavLink to="/login" className={navLinkClass}>
                  Login
                </NavLink>
              )}
            </div>
            <div className="nav-right nav-spacer-desktop">
              <ThemeToggle />
              {token && (
                <button type="button" className="btn ghost small" onClick={logout}>
                  Logout
                </button>
              )}
            </div>
            <div className="nav-mobile-end">
              <ThemeToggle />
              <button
                type="button"
                className={`nav-burger ${menuOpen ? "is-open" : ""}`}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                aria-controls="nav-mobile-menu"
                onClick={() => setMenuOpen((o) => !o)}
              >
                <span className="nav-burger-bar" aria-hidden="true" />
                <span className="nav-burger-bar" aria-hidden="true" />
                <span className="nav-burger-bar" aria-hidden="true" />
              </button>
            </div>
          </div>
        </nav>
        <div
          id="nav-mobile-menu"
          className={`nav-mobile-dropdown ${menuOpen ? "is-open" : ""}`}
          hidden={!menuOpen}
        >
          {token ? (
            <>
              <NavLink
                to="/report"
                className={(p) => `${navLinkClass(p)} nav-link-mobile`}
                onClick={() => setMenuOpen(false)}
              >
                Report
              </NavLink>
              <NavLink
                to="/week"
                className={(p) => `${navLinkClass(p)} nav-link-mobile`}
                onClick={() => setMenuOpen(false)}
              >
                Week
              </NavLink>
              <NavLink
                to="/"
                end
                className={(p) => `${navLinkClass(p)} nav-link-mobile`}
                onClick={() => setMenuOpen(false)}
              >
                Daily
              </NavLink>
              <NavLink
                to="/settings"
                className={(p) => `${navLinkClass(p)} nav-link-mobile`}
                onClick={() => setMenuOpen(false)}
              >
                Settings
              </NavLink>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                Logout
              </button>
            </>
          ) : (
            <NavLink
              to="/login"
              className={(p) => `${navLinkClass(p)} nav-link-mobile`}
              onClick={() => setMenuOpen(false)}
            >
              Login
            </NavLink>
          )}
        </div>
      </div>
    </div>
  );
}

function parseBulkTodoText(rawText, fallbackDate) {
  const text = String(rawText ?? "");
  const lines = text.split(/\r?\n/);
  const items = [];

  for (const rawLine of lines) {
    let line = String(rawLine ?? "").trim();
    if (!line) continue;

    line = line.replace(/^(?:[-*]|•)\s+/, "");

    let date = null;
    const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2})\s*[:\-]\s*(.+)$/);
    if (dateMatch) {
      date = dateMatch[1];
      line = dateMatch[2].trim();
    }

    let completed = false;
    const checkMatch = line.match(/^\[\s*([xX]|\s)\s*\]\s*(.+)$/);
    if (checkMatch) {
      completed = checkMatch[1].toLowerCase() === "x";
      line = checkMatch[2].trim();
    } else {
      const doneMatch = line.match(/^(done|undone)\s*:\s*(.+)$/i);
      if (doneMatch) {
        completed = doneMatch[1].toLowerCase() === "done";
        line = doneMatch[2].trim();
      }
    }

    const title = line.trim();
    if (!title) continue;

    items.push({
      title,
      completed,
      date: date || fallbackDate,
    });
  }

  return items;
}

function slotLabel(s) {
  if (s === "morning") return "Morning";
  if (s === "afternoon") return "Afternoon";
  if (s === "evening") return "Evening";
  return null;
}

function formatDbCreatedAt(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function DailyTasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    selectedDate,
    setSelectedDate,
    title,
    setTitle,
    todos,
    loading,
    err,
    editingId,
    setEditingId,
    editTitle,
    setEditTitle,
    editTags,
    setEditTags,
    editTimeSlot,
    setEditTimeSlot,
    editPinRank,
    setEditPinRank,
    onToggle,
    onDelete,
    startEdit,
    saveEdit,
    onBulkImport,
    createTodoDetailed,
    streaks,
    goals,
    habitsLoading,
    onSuppressDefault,
    onRestoreDefault,
    onCreateGoal,
    onDeleteGoal,
    userDefaultTasks,
    saveUserDefaultTemplates,
    defaultDayStatus,
    onApplyDefaultsForDay,
  } = useAppData();
  const { settings } = useSettings();

  const [bulkText, setBulkText] = useState("");
  /** "db" = oldest first (as saved in MongoDB); "organized" = pins · time · title */
  const [listOrder, setListOrder] = useState("db");
  const [tagFilter, setTagFilter] = useState(null);
  const [addTagsInput, setAddTagsInput] = useState("");
  const [addTimeSlot, setAddTimeSlot] = useState("");
  const [addPinRank, setAddPinRank] = useState("");
  const [goalTitle, setGoalTitle] = useState("");
  const [goalPeriod, setGoalPeriod] = useState("week");
  const [goalTarget, setGoalTarget] = useState("4");
  const [goalTag, setGoalTag] = useState("");
  const [defaultsModalOpen, setDefaultsModalOpen] = useState(false);
  const [draftDefaults, setDraftDefaults] = useState([]);
  const defaultsModalTitleId = useId();

  const comboBump = useRef(createComboTracker());
  const [sessionClears, setSessionClears] = useState(0);
  const [celebrateId, setCelebrateId] = useState(null);
  const [completionToast, setCompletionToast] = useState(null);

  const todayLocal = useMemo(() => localCalendarISO(), []);

  const todosForView = useMemo(() => {
    if (selectedDate > todayLocal) {
      return todos.filter((t) => !t.defaultId);
    }
    return todos;
  }, [todos, selectedDate, todayLocal]);

  useEffect(() => {
    if (defaultsModalOpen) {
      setDraftDefaults(userDefaultTasks.map((t) => ({ id: t.id, title: t.title })));
    }
  }, [defaultsModalOpen, userDefaultTasks]);

  useEffect(() => {
    if (!defaultsModalOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setDefaultsModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [defaultsModalOpen]);

  useEffect(() => {
    const d = searchParams.get("date");
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      setSelectedDate(d);
    }
  }, [searchParams, setSelectedDate]);

  useEffect(() => {
    if (selectedDate < todayLocal) setSelectedDate(todayLocal);
  }, [selectedDate, setSelectedDate, todayLocal]);

  function setDateAndUrl(v) {
    setSelectedDate(v);
    if (v) setSearchParams({ date: v });
  }

  const allTags = useMemo(() => collectTagsFromTodos(todosForView), [todosForView]);
  const filtered = useMemo(() => {
    const tagged = filterTodosByTag(todosForView, tagFilter);
    return listOrder === "db" ? sortTodosByDbOrder(tagged) : sortTodosForDisplay(tagged);
  }, [todosForView, tagFilter, listOrder]);

  const dayStats = useMemo(() => {
    const total = todosForView.length;
    const done = todosForView.filter((t) => t.completed).length;
    const rate = total === 0 ? 0 : Math.round((done / total) * 1000) / 10;
    return { total, done, rate };
  }, [todosForView]);

  const isFutureDaySelected = selectedDate > todayLocal;

  async function handleAdd(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const tags = parseTagsFromInput(addTagsInput);
    const timeSlot =
      addTimeSlot === "morning" || addTimeSlot === "afternoon" || addTimeSlot === "evening"
        ? addTimeSlot
        : null;
    const pr = addPinRank === "" ? null : Number.parseInt(addPinRank, 10);
    const pinRank = Number.isFinite(pr) && pr >= 1 && pr <= 3 ? pr : null;
    await createTodoDetailed({ title: title.trim(), tags, timeSlot, pinRank });
    setAddTagsInput("");
    setAddTimeSlot("");
    setAddPinRank("");
  }

  const editTagsStr = useMemo(() => (editTags || []).join(", "), [editTags]);

  async function handleTaskToggle(t, e) {
    const willComplete = !t.completed;
    const c = settings.completion;
    if (willComplete && c.enabled) {
      const input = e.currentTarget;
      const rect = input.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const reduced = prefersReducedMotion();
      if (c.showSessionClears) setSessionClears((n) => n + 1);
      if (!reduced && (c.particles || c.partyConfetti)) {
        if (c.partyConfetti) completionConfettiBurst(cx, cy);
        if (c.particles) completionBurst(cx, cy);
        setCelebrateId(t.id);
        window.setTimeout(() => setCelebrateId(null), 700);
      }
      if (!reduced && c.sound) playCompletionChime();
      if (c.toast) {
        const combo = comboBump.current();
        const msg = combo >= 2 ? `${pickComboPraise()} ×${combo}` : pickPraise();
        setCompletionToast({ text: msg, key: Date.now() });
        window.setTimeout(() => setCompletionToast(null), 2600);
      }
    }
    await onToggle(t.id);
  }

  return (
    <>
      <header className="header header-below-nav">
        <h1 className="page-title">For daily tasks</h1>
        <p className="tagline">Habits, tags, time buckets, pins — organized by day</p>
      </header>

      {err && (
        <div className="banner error" role="alert">
          {err}
        </div>
      )}

      {(settings.sections.habitsAndStreaks || settings.sections.goals) && (
      <section className="panel habits-panel" aria-label="Habits, streaks, and goals">
        {settings.sections.habitsAndStreaks && (
        <>
        <div className="panel-head row habits-panel-head">
          <div>
            <h2 id="habits-heading">Habits &amp; streaks</h2>
            <span className="hint">
              Default habits are not added until you use <strong>Add default habits for this day</strong> (not for future days until that day). Tag a task <code>#core</code> for core streaks.
            </span>
          </div>
          <button type="button" className="btn ghost small habits-defaults-btn" onClick={() => setDefaultsModalOpen(true)}>
            My default habits
          </button>
        </div>
        {habitsLoading && !streaks ? (
          <p className="muted pad">Loading…</p>
        ) : streaks ? (
          <div className="streak-grid" role="group" aria-label="Streak counts">
            <div className="streak-card">
              <span className="streak-value">{streaks.streakAnyCompleted}</span>
              <span className="streak-label">Days with ≥1 done</span>
            </div>
            <div className="streak-card">
              <span className="streak-value">{streaks.streakFullDay}</span>
              <span className="streak-label">100% days (all tasks)</span>
            </div>
            <div className="streak-card">
              <span className="streak-value">{streaks.streakCore}</span>
              <span className="streak-label">Core 100% (defaults + #core)</span>
            </div>
          </div>
        ) : null}
        </>
        )}

        {settings.sections.goals && (
        <>
        <h3 className="goals-subheading">Weekly / monthly goals</h3>
        <p className="hint goals-hint">Count completed tasks whose tag matches (e.g. tag <code>#run</code> + goal tag <code>run</code>).</p>
        <ul className="goals-list">
          {goals.map((g) => (
            <li key={g.id} className="goal-row">
              <div className="goal-row-head">
                <div className="goal-row-text">
                  <strong>{g.title}</strong>
                  <span className="muted small">
                    {g.period} · #{g.matchTag} · {g.currentCount ?? 0}/{g.targetCount}
                  </span>
                </div>
                <button type="button" className="btn danger small" onClick={() => onDeleteGoal(g.id)}>
                  Remove
                </button>
              </div>
              <div
                className="goal-bar-wrap"
                role="progressbar"
                aria-valuenow={Math.round((g.progress || 0) * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="goal-bar-fill" style={{ width: `${Math.min(100, (g.progress || 0) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <form
          className="goal-form"
          onSubmit={(e) => {
            e.preventDefault();
            const t = Number.parseInt(goalTarget, 10);
            if (!goalTitle.trim() || !goalTag.trim() || !Number.isFinite(t) || t < 1) return;
            onCreateGoal({
              title: goalTitle.trim(),
              period: goalPeriod,
              targetCount: t,
              matchTag: goalTag.trim().toLowerCase(),
            });
            setGoalTitle("");
            setGoalTag("");
            setGoalTarget("4");
          }}
        >
          <input
            className="text-input"
            placeholder="Goal label (e.g. Run 4×)"
            value={goalTitle}
            onChange={(e) => setGoalTitle(e.target.value)}
            maxLength={120}
          />
          <select className="text-input goal-select" value={goalPeriod} onChange={(e) => setGoalPeriod(e.target.value)} aria-label="Goal period">
            <option value="week">This week</option>
            <option value="month">This month</option>
          </select>
          <input
            className="text-input goal-target"
            type="number"
            min={1}
            max={999}
            value={goalTarget}
            onChange={(e) => setGoalTarget(e.target.value)}
            aria-label="Target count"
          />
          <input
            className="text-input"
            placeholder="tag (e.g. run)"
            value={goalTag}
            onChange={(e) => setGoalTag(e.target.value.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase())}
            maxLength={32}
          />
          <button type="submit" className="btn primary small">
            Add goal
          </button>
        </form>
        </>
        )}
      </section>
      )}

      <section className="panel day-panel" aria-labelledby="daily-heading">
        <div className="panel-head row">
          <div>
            <h2 id="daily-heading">Tasks for this day</h2>
            <label className="date-label">
              Date{" "}
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setDateAndUrl(e.target.value)}
                min={todayLocal}
                className="date-input"
              />
            </label>
            {isFutureDaySelected && (
              <span className="hint date-future-hint">
                You’re viewing a future day — default habits stay hidden until that calendar day.
              </span>
            )}
          </div>
          <div className="day-summary day-summary-with-game">
            <div className="stat">
              <span className="stat-value">{dayStats.rate}%</span>
              <span className="stat-label">done today</span>
            </div>
            <div className="stat small">
              <span>
                {dayStats.done}/{dayStats.total}
              </span>
              <span className="stat-label">tasks</span>
            </div>
            {settings.completion.showSessionClears && sessionClears > 0 && (
              <div className="day-game-hud" title="Tasks checked off this visit">
                <span className="day-game-hud-icon" aria-hidden="true">
                  ✦
                </span>
                <span className="day-game-hud-val">{sessionClears}</span>
                <span className="day-game-hud-lbl">clears</span>
              </div>
            )}
          </div>
        </div>

        {settings.sections.habitsAndStreaks && defaultDayStatus.missingCount > 0 && !isFutureDaySelected && (
          <div className="default-day-prompt" role="region" aria-label="Default habits for this day">
            <p className="default-day-prompt-text">
              You have <strong>{defaultDayStatus.missingCount}</strong> default{" "}
              {defaultDayStatus.missingCount === 1 ? "habit" : "habits"} not on this day yet (skipped habits are
              excluded). Add them when you are ready.
            </p>
            <button type="button" className="btn primary" onClick={() => onApplyDefaultsForDay()}>
              Add default habits for this day
            </button>
          </div>
        )}

        {allTags.length > 0 && (
          <div className="tag-filter-bar" role="toolbar" aria-label="Filter by tag">
            <span className="tag-filter-label">Tags</span>
            <button
              type="button"
              className={`tag-chip ${tagFilter == null ? "active" : ""}`}
              onClick={() => setTagFilter(null)}
            >
              All
            </button>
            {allTags.map((tg) => (
              <button
                key={tg}
                type="button"
                className={`tag-chip ${tagFilter === tg ? "active" : ""}`}
                onClick={() => setTagFilter((f) => (f === tg ? null : tg))}
              >
                #{tg}
              </button>
            ))}
          </div>
        )}

        <div className="list-order-bar" role="toolbar" aria-label="List order">
          <span className="tag-filter-label">Order</span>
          <div className="chart-filter-buttons">
            <button
              type="button"
              className={`chart-filter-btn ${listOrder === "db" ? "active" : ""}`}
              onClick={() => setListOrder("db")}
              aria-pressed={listOrder === "db"}
            >
              As in database
            </button>
            <button
              type="button"
              className={`chart-filter-btn ${listOrder === "organized" ? "active" : ""}`}
              onClick={() => setListOrder("organized")}
              aria-pressed={listOrder === "organized"}
            >
              Organized (pins · time)
            </button>
          </div>
          <span className="hint list-order-hint">
            {listOrder === "db"
              ? "Oldest tasks first (by createdAt from the database)."
              : "Pins 1–3, then morning/afternoon/evening, then title."}
          </span>
        </div>

        {settings.sections.bulkImport && (
        <div className="bulk-import" aria-label="Bulk import">
          <div className="bulk-import-header">
            <h3 className="bulk-import-title">Bulk import</h3>
            <p className="bulk-import-desc">
              Paste many tasks at once — <strong>one per line.</strong> Optional date prefix and checkboxes
              supported.
            </p>
          </div>

          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="text-input bulk-import-textarea"
            placeholder="Paste tasks here, one per line…"
            maxLength={20000}
            spellCheck={false}
            aria-label="Bulk import text"
          />

          <div className="bulk-actions">
            <span className="bulk-import-counter" aria-live="polite">
              {bulkText.length.toLocaleString()}
              <span className="bulk-import-counter-max"> / 20,000</span>
            </span>
            <div className="bulk-actions-buttons">
              <button
                type="button"
                className="btn bulk-import-clear"
                onClick={() => setBulkText("")}
                disabled={loading || !bulkText.trim()}
              >
                Clear
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={loading || !bulkText.trim()}
                onClick={async () => {
                  const items = parseBulkTodoText(bulkText, selectedDate);
                  if (!items.length) return;
                  await onBulkImport(items);
                  setBulkText("");
                }}
              >
                Import tasks
              </button>
            </div>
          </div>
        </div>
        )}

        <form onSubmit={handleAdd} className="add-form add-form-extended">
          <div className="add-form-row">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a task…"
              className="text-input"
              maxLength={500}
              aria-label="New task title"
            />
            <button type="submit" className="btn primary" disabled={loading}>
              Add
            </button>
          </div>
          <div className="add-form-meta">
            <input
              type="text"
              className="text-input"
              placeholder="Tags: work, health or #work"
              value={addTagsInput}
              onChange={(e) => setAddTagsInput(e.target.value)}
              maxLength={200}
              aria-label="Tags for new task"
            />
            <select
              className="text-input"
              value={addTimeSlot}
              onChange={(e) => setAddTimeSlot(e.target.value)}
              aria-label="Time of day"
            >
              <option value="">Time: any</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
              <option value="evening">Evening</option>
            </select>
            <select
              className="text-input"
              value={addPinRank}
              onChange={(e) => setAddPinRank(e.target.value)}
              aria-label="Pin priority"
            >
              <option value="">Pin: no</option>
              <option value="1">Pin 1</option>
              <option value="2">Pin 2</option>
              <option value="3">Pin 3</option>
            </select>
          </div>
        </form>

        {loading && !todos.length ? (
          <p className="muted center pad">Loading tasks…</p>
        ) : filtered.length === 0 ? (
          <p className="muted center pad">
            {todosForView.length === 0 ? "No tasks for this day. Add one above." : "No tasks match this tag filter."}
          </p>
        ) : (
          <ul className="todo-list">
            {filtered.map((t) => {
              const isDefault = Boolean(t.defaultId);
              return (
                <li
                  key={t.id}
                  className={`todo-item ${t.completed ? "done" : ""} ${celebrateId === t.id ? "todo-item--celebrate" : ""}`}
                >
                  <label className="check-wrap">
                    <input
                      type="checkbox"
                      checked={t.completed}
                      onChange={(e) => void handleTaskToggle(t, e)}
                      aria-label={t.completed ? "Mark incomplete" : "Mark complete"}
                    />
                    {editingId === t.id ? (
                      <span className="edit-row edit-row-extended">
                        <input
                          className="text-input inline"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") {
                              setEditingId(null);
                              setEditTitle("");
                              setEditTags([]);
                              setEditTimeSlot(null);
                              setEditPinRank(null);
                            }
                          }}
                          autoFocus
                        />
                        <input
                          className="text-input inline"
                          placeholder="tags"
                          value={editTagsStr}
                          onChange={(e) => setEditTags(parseTagsFromInput(e.target.value))}
                        />
                        <select
                          className="text-input inline"
                          value={editTimeSlot ?? ""}
                          onChange={(e) => setEditTimeSlot(e.target.value || null)}
                          aria-label="Edit time of day"
                        >
                          <option value="">Any time</option>
                          <option value="morning">Morning</option>
                          <option value="afternoon">Afternoon</option>
                          <option value="evening">Evening</option>
                        </select>
                        <select
                          className="text-input inline"
                          value={editPinRank ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditPinRank(v === "" ? null : Number.parseInt(v, 10));
                          }}
                          aria-label="Edit pin"
                        >
                          <option value="">No pin</option>
                          <option value="1">Pin 1</option>
                          <option value="2">Pin 2</option>
                          <option value="3">Pin 3</option>
                        </select>
                        <button type="button" className="btn small" onClick={saveEdit}>
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn small ghost"
                          onClick={() => {
                            setEditingId(null);
                            setEditTitle("");
                            setEditTags([]);
                            setEditTimeSlot(null);
                            setEditPinRank(null);
                          }}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <span className="todo-main">
                        <span className="todo-title">{t.title}</span>
                        {listOrder === "db" &&
                          settings.daily.showCreatedTimestamp &&
                          (() => {
                            const saved = formatDbCreatedAt(t.createdAt);
                            if (saved) {
                              return <span className="todo-saved-at">Saved {saved}</span>;
                            }
                            if (t.id) {
                              return (
                                <span className="todo-saved-at muted">No createdAt in DB — id: {t.id}</span>
                              );
                            }
                            return null;
                          })()}
                        <span className="todo-badges">
                          {t.pinRank != null && <span className="badge pin">Pin {t.pinRank}</span>}
                          {slotLabel(t.timeSlot) && (
                            <span className="badge slot">{slotLabel(t.timeSlot)}</span>
                          )}
                          {Array.isArray(t.tags) &&
                            t.tags.map((tg) => (
                              <span key={tg} className="badge tag">
                                #{tg}
                              </span>
                            ))}
                        </span>
                      </span>
                    )}
                  </label>
                  {editingId !== t.id && (
                    <div className="actions">
                      {isDefault && (
                        <button
                          type="button"
                          className="btn ghost small"
                          title="Remove this default for today only"
                          onClick={() => onSuppressDefault(selectedDate, t.defaultId)}
                        >
                          Skip today
                        </button>
                      )}
                      <button type="button" className="btn ghost small" onClick={() => startEdit(t)}>
                        Edit
                      </button>
                      <button type="button" className="btn danger small" onClick={() => onDelete(t.id)}>
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {settings.sections.habitsAndStreaks && !isFutureDaySelected && (
          <div className="restore-defaults">
            <span className="hint">Skipped a habit? Restore it for this day:</span>
            <div className="restore-chips">
              {userDefaultTasks.map((def) => (
                <button
                  key={def.id}
                  type="button"
                  className="btn ghost small"
                  onClick={() => onRestoreDefault(selectedDate, def.id)}
                >
                  + {def.title.slice(0, 28)}
                  {def.title.length > 28 ? "…" : ""}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {defaultsModalOpen && (
        <div
          className="defaults-modal-overlay"
          role="presentation"
          onClick={() => setDefaultsModalOpen(false)}
        >
          <div
            className="defaults-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={defaultsModalTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="defaults-modal-head">
              <h2 id={defaultsModalTitleId} className="defaults-modal-title">
                Your daily default habits
              </h2>
              <p className="hint defaults-modal-desc">
                These are added automatically each day for <strong>your account</strong> only. Another user sees their own list after login.
              </p>
            </div>
            <ul className="defaults-modal-list">
              {draftDefaults.map((row, idx) => (
                <li key={row.id} className="defaults-modal-row">
                  <input
                    type="text"
                    className="text-input"
                    value={row.title}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraftDefaults((rows) => rows.map((r, i) => (i === idx ? { ...r, title: v } : r)));
                    }}
                    placeholder="Habit title"
                    maxLength={500}
                    aria-label={`Habit ${idx + 1}`}
                  />
                  <button
                    type="button"
                    className="btn danger small"
                    onClick={() => setDraftDefaults((rows) => rows.filter((r) => r.id !== row.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="defaults-modal-actions">
              <button type="button" className="btn ghost" onClick={() => setDraftDefaults((rows) => [...rows, { id: crypto.randomUUID(), title: "" }])}>
                Add habit
              </button>
              <div className="defaults-modal-actions-right">
                <button type="button" className="btn ghost" onClick={() => setDefaultsModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={async () => {
                    try {
                      await saveUserDefaultTemplates(draftDefaults);
                      setDefaultsModalOpen(false);
                    } catch {
                      /* error shown in banner */
                    }
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {completionToast && (
        <div className="completion-toast" role="status" aria-live="polite" key={completionToast.key}>
          {completionToast.text}
        </div>
      )}
    </>
  );
}

function RequireAuth() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AppDataLayout() {
  return (
    <AppDataProvider>
      <Outlet />
    </AppDataProvider>
  );
}

function AppFooter() {
  const year = new Date().getFullYear();
  const { token } = useAuth();
  return (
    <footer className="app-footer" role="contentinfo" aria-label="Site footer">
      <div className="app-footer-top">
        <nav className="app-footer-quick" aria-label="Quick links">
          <span className="app-footer-quick-label">Quick</span>
          {token ? (
            <>
              <Link to="/" className="app-footer-quick-link">
                Daily
              </Link>
              <span className="app-footer-quick-dot" aria-hidden="true">
                ·
              </span>
              <Link to="/week" className="app-footer-quick-link">
                Week
              </Link>
              <span className="app-footer-quick-dot" aria-hidden="true">
                ·
              </span>
              <Link to="/report" className="app-footer-quick-link">
                Report
              </Link>
              <span className="app-footer-quick-dot" aria-hidden="true">
                ·
              </span>
              <Link to="/settings" className="app-footer-quick-link">
                Settings
              </Link>
              <span className="app-footer-quick-dot" aria-hidden="true">
                ·
              </span>
            </>
          ) : (
            <>
              <Link to="/login" className="app-footer-quick-link">
                Login
              </Link>
              <span className="app-footer-quick-dot" aria-hidden="true">
                ·
              </span>
            </>
          )}
          <Link to="/about" className="app-footer-quick-link">
            About us
          </Link>
        </nav>
      </div>
      <p className="app-footer-line">
        <span className="app-footer-brand">Daily To-Do List</span>
        <span className="app-footer-dot" aria-hidden="true">
          ·
        </span>
        <span>{year}</span>
      </p>
      <p className="app-footer-tagline muted">Habits, focus, one day at a time</p>
    </footer>
  );
}

function AppLayout() {
  const { token } = useAuth();
  return (
    <div className="app">
      <AppNavbar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<AppDataLayout />}>
            <Route index element={<DailyTasksPage />} />
            <Route path="week" element={<WeekViewPage />} />
            <Route
              path="report"
              element={
                <Suspense fallback={<p className="muted center pad">Loading report…</p>}>
                  <ReportPage />
                </Suspense>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to={token ? "/" : "/login"} replace />} />
      </Routes>
      <AppFooter />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <SettingsProvider>
          <AppLayout />
        </SettingsProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
