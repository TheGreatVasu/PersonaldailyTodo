import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppDataProvider, useAppData } from "./AppDataContext.jsx";
import "./App.css";

export const CHART_RANGE_OPTIONS = [7, 14, 30, 90];

function getViewport() {
  if (typeof window === "undefined") {
    return {
      isXs: false,
      isMobile: false,
      isTablet: false,
      isDesktop: false,
      isShort: false,
    };
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    isXs: w <= 400,
    isMobile: w <= 520,
    isTablet: w > 520 && w < 900,
    isDesktop: w >= 1024,
    isShort: h <= 520,
  };
}

function useViewport() {
  const [v, setV] = useState(getViewport);
  useEffect(() => {
    const update = () => setV(getViewport());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return v;
}

export function chartHeightForViewport(v) {
  if (v.isShort && v.isMobile) return 180;
  if (v.isXs) return 200;
  if (v.isMobile) return 220;
  if (v.isTablet) return 260;
  if (v.isDesktop) return 300;
  return 280;
}

export function formatChartLabel(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatReportDate(iso) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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

function ReportPage() {
  const {
    report,
    reportRangeDays,
    setReportRangeDays,
    chartMetric,
    setChartMetric,
    reportLoading,
    err,
  } = useAppData();

  const vp = useViewport();
  const chartHeight = chartHeightForViewport(vp);
  const chartCompact = vp.isMobile;

  const chartData = useMemo(
    () =>
      report.map((r) => ({
        ...r,
        label: formatChartLabel(r.date),
        shortDate: r.date.slice(5),
      })),
    [report]
  );

  const reportInsights = useMemo(() => {
    let totalCompleted = 0;
    let totalTasks = 0;
    let bestRate = -1;
    let bestDate = null;
    let perfectDays = 0;
    let sumDayRates = 0;
    let activeDays = 0;
    for (const r of report) {
      totalCompleted += r.completed;
      totalTasks += r.total;
      if (r.total > 0) {
        activeDays += 1;
        sumDayRates += r.rate;
        if (r.rate > bestRate) {
          bestRate = r.rate;
          bestDate = r.date;
        }
        if (r.rate >= 100) perfectDays += 1;
      }
    }
    const overallRate =
      totalTasks === 0 ? 0 : Math.round((totalCompleted / totalTasks) * 1000) / 10;
    const avgDayRate =
      activeDays === 0 ? 0 : Math.round((sumDayRates / activeDays) * 10) / 10;
    return {
      totalCompleted,
      totalTasks,
      overallRate,
      avgDayRate,
      bestRate: bestRate < 0 ? null : bestRate,
      bestDate,
      perfectDays,
    };
  }, [report]);

  const reportRowsNewestFirst = useMemo(() => [...report].reverse(), [report]);

  const chartMetricLabel =
    chartMetric === "rate" ? "% complete" : chartMetric === "completed" ? "Tasks done" : "Total tasks";

  return (
    <>
      <header className="header header-below-nav">
        <h1 className="page-title">Report</h1>
        <p className="tagline">Summary, chart, and daily breakdown for your selected range</p>
      </header>

      {err && (
        <div className="banner error" role="alert">
          {err}
        </div>
      )}

      <section className="panel report-panel" aria-labelledby="report-heading">
        <div className="panel-head">
          <h2 id="report-heading">Progress report</h2>
          <span className="hint">
            Last {reportRangeDays} days — summary, chart, and daily breakdown
          </span>
        </div>

        {reportLoading && !report.length ? (
          <p className="muted center pad">Loading report…</p>
        ) : (
          <>
            <div
              className="report-summary"
              role="group"
              aria-label={`${reportRangeDays}-day summary`}
            >
              <div className="report-stat">
                <span className="report-stat-value">{reportInsights.overallRate}%</span>
                <span className="report-stat-label">Overall done (all tasks)</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{reportInsights.avgDayRate}%</span>
                <span className="report-stat-label">Avg day score</span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">
                  {reportInsights.bestDate != null ? `${reportInsights.bestRate}%` : "—"}
                </span>
                <span className="report-stat-label">
                  Best day
                  {reportInsights.bestDate && (
                    <span className="report-stat-sub">{formatChartLabel(reportInsights.bestDate)}</span>
                  )}
                </span>
              </div>
              <div className="report-stat">
                <span className="report-stat-value">{reportInsights.perfectDays}</span>
                <span className="report-stat-label">Perfect days (100%)</span>
              </div>
            </div>

            <div className="chart-filters" role="toolbar" aria-label="Chart filters">
              <div className="chart-filter-group">
                <span className="chart-filter-label" id="filter-range-label">
                  Range
                </span>
                <div className="chart-filter-buttons" role="group" aria-labelledby="filter-range-label">
                  {CHART_RANGE_OPTIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`chart-filter-btn ${reportRangeDays === d ? "active" : ""}`}
                      onClick={() => setReportRangeDays(d)}
                      aria-pressed={reportRangeDays === d}
                    >
                      {d} days
                    </button>
                  ))}
                </div>
              </div>
              <div className="chart-filter-group">
                <span className="chart-filter-label" id="filter-metric-label">
                  Show
                </span>
                <div className="chart-filter-buttons" role="group" aria-labelledby="filter-metric-label">
                  {[
                    { key: "rate", label: "% Done" },
                    { key: "completed", label: "Done count" },
                    { key: "total", label: "Total tasks" },
                  ].map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      className={`chart-filter-btn ${chartMetric === m.key ? "active" : ""}`}
                      onClick={() => setChartMetric(m.key)}
                      aria-pressed={chartMetric === m.key}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <h3 className="report-subheading">Completion trend</h3>
            <p className="hint report-hint-inline">
              {chartMetric === "rate"
                ? "Daily completion rate (%)"
                : chartMetric === "completed"
                  ? "Tasks completed per day"
                  : "Total tasks scheduled per day"}
            </p>
            <div className={`chart-wrap ${reportLoading ? "chart-wrap-loading" : ""}`}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <AreaChart
                  data={chartData}
                  margin={
                    chartCompact
                      ? { top: 6, right: 4, left: -4, bottom: 4 }
                      : { top: 8, right: 12, left: 0, bottom: 0 }
                  }
                >
                  <defs>
                    <linearGradient id="rateFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3d9cf0" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3d9cf0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3a50" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#8b9cb3", fontSize: chartCompact ? 9 : 11 }}
                    interval="preserveStartEnd"
                    minTickGap={chartCompact ? 6 : 24}
                    angle={chartCompact ? -35 : 0}
                    textAnchor={chartCompact ? "end" : "middle"}
                    height={chartCompact ? 48 : 30}
                  />
                  <YAxis
                    domain={chartMetric === "rate" ? [0, 100] : [0, "dataMax"]}
                    tick={{ fill: "#8b9cb3", fontSize: chartCompact ? 10 : 11 }}
                    width={chartMetric === "rate" ? (chartCompact ? 30 : 36) : chartCompact ? 34 : 40}
                    unit={chartMetric === "rate" ? "%" : ""}
                    allowDecimals={chartMetric !== "rate"}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1a2332",
                      border: "1px solid #243044",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#e8edf5" }}
                    formatter={(value, _name, item) => {
                      const p = item?.payload;
                      if (chartMetric === "rate") {
                        const extra = p ? ` (${p.completed}/${p.total} tasks)` : "";
                        return [`${value}%${extra}`, chartMetricLabel];
                      }
                      const extra = p ? ` · ${p.rate}% · ${p.completed}/${p.total}` : "";
                      const v =
                        chartMetric === "completed"
                          ? `${value} done${extra}`
                          : `${value} tasks${extra}`;
                      return [v, chartMetricLabel];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey={chartMetric}
                    stroke="#3d9cf0"
                    strokeWidth={2}
                    fill="url(#rateFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <h3 className="report-subheading">Daily breakdown</h3>
            <div className="report-table-wrap">
              <table className="report-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Done</th>
                    <th scope="col">Total</th>
                    <th scope="col">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRowsNewestFirst.map((r) => (
                    <tr key={r.date}>
                      <td>{formatReportDate(r.date)}</td>
                      <td>{r.completed}</td>
                      <td>{r.total}</td>
                      <td>
                        {r.total === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className={r.rate >= 100 ? "report-rate-perfect" : ""}>{r.rate}%</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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
        <Route path="/report" element={<ReportPage />} />
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
