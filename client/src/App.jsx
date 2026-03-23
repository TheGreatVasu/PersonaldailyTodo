import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AppDataProvider, useAppData } from "./AppDataContext.jsx";
import "./App.css";

const ReportPage = lazy(() => import("./ReportPage.jsx"));

function navLinkClass({ isActive }) {
  return `nav-link${isActive ? " nav-link-active" : ""}`;
}

function AppNavbar() {
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
              Rastogi Todo List
            </Link>
            <div className="nav-center nav-links-desktop">
              <NavLink to="/report" className={navLinkClass}>
                Report Page
              </NavLink>
              <NavLink to="/" end className={navLinkClass}>
                Daily Task
              </NavLink>
            </div>
            <span className="nav-spacer nav-spacer-desktop" aria-hidden="true" />
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
        </nav>
        <div
          id="nav-mobile-menu"
          className={`nav-mobile-dropdown ${menuOpen ? "is-open" : ""}`}
          hidden={!menuOpen}
        >
          <NavLink
            to="/report"
            className={(p) => `${navLinkClass(p)} nav-link-mobile`}
            onClick={() => setMenuOpen(false)}
          >
            Report Page
          </NavLink>
          <NavLink
            to="/"
            end
            className={(p) => `${navLinkClass(p)} nav-link-mobile`}
            onClick={() => setMenuOpen(false)}
          >
            Daily Task
          </NavLink>
        </div>
      </div>
    </div>
  );
}

function DailyTasksPage() {
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
    onAdd,
    onToggle,
    onDelete,
    startEdit,
    saveEdit,
  } = useAppData();

  const dayStats = useMemo(() => {
    const total = todos.length;
    const done = todos.filter((t) => t.completed).length;
    const rate = total === 0 ? 0 : Math.round((done / total) * 1000) / 10;
    return { total, done, rate };
  }, [todos]);

  return (
    <>
      <header className="header header-below-nav">
        <h1 className="page-title">For daily tasks</h1>
        <p className="tagline">Your personal list — add and check off tasks by day</p>
      </header>

      {err && (
        <div className="banner error" role="alert">
          {err}
        </div>
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
                onChange={(e) => setSelectedDate(e.target.value)}
                className="date-input"
              />
            </label>
          </div>
          <div className="day-summary">
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
          </div>
        </div>

        <form onSubmit={onAdd} className="add-form">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task for this day…"
            className="text-input"
            maxLength={500}
            aria-label="New task title"
          />
          <button type="submit" className="btn primary" disabled={loading}>
            Add
          </button>
        </form>

        {loading && !todos.length ? (
          <p className="muted center pad">Loading tasks…</p>
        ) : todos.length === 0 ? (
          <p className="muted center pad">No tasks for this day. Add one above.</p>
        ) : (
          <ul className="todo-list">
            {todos.map((t) => (
              <li key={t.id} className={`todo-item ${t.completed ? "done" : ""}`}>
                <label className="check-wrap">
                  <input
                    type="checkbox"
                    checked={t.completed}
                    onChange={() => onToggle(t.id)}
                    aria-label={t.completed ? "Mark incomplete" : "Mark complete"}
                  />
                  {editingId === t.id ? (
                    <span className="edit-row">
                      <input
                        className="text-input inline"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") {
                            setEditingId(null);
                            setEditTitle("");
                          }
                        }}
                        autoFocus
                      />
                      <button type="button" className="btn small" onClick={saveEdit}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={() => {
                          setEditingId(null);
                          setEditTitle("");
                        }}
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <span className="todo-title">{t.title}</span>
                  )}
                </label>
                {editingId !== t.id && (
                  <div className="actions">
                    <button type="button" className="btn ghost small" onClick={() => startEdit(t)}>
                      Edit
                    </button>
                    <button type="button" className="btn danger small" onClick={() => onDelete(t.id)}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function AppLayout() {
  return (
    <div className="app">
      <AppNavbar />
      <Routes>
        <Route path="/" element={<DailyTasksPage />} />
        <Route
          path="/report"
          element={
            <Suspense fallback={<p className="muted center pad">Loading report…</p>}>
              <ReportPage />
            </Suspense>
          }
        />
      </Routes>
      <footer className="footer">
        <p className="footer-brand">Rastogi Todo List</p>
        <p>
          Data is stored on your machine in <code>server/data/todos.json</code>.
        </p>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppDataProvider>
      <AppLayout />
    </AppDataProvider>
  );
}
