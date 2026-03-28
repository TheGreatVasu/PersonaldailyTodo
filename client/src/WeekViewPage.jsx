import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchTodosRange } from "./api.js";
import { addDaysLocal, mondayOfWeekLocal, weekDatesFromMonday } from "./todoUtils.js";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatShort(iso) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function WeekViewPage() {
  const [weekMonday, setWeekMonday] = useState(() => mondayOfWeekLocal(todayISO()));
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const weekEnd = useMemo(() => addDaysLocal(weekMonday, 6), [weekMonday]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        setErr(null);
        const data = await fetchTodosRange(weekMonday, weekEnd);
        if (!cancelled) setTodos(data);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekMonday, weekEnd]);

  const byDate = useMemo(() => {
    const m = new Map();
    for (const d of weekDatesFromMonday(weekMonday)) {
      m.set(d, []);
    }
    for (const t of todos) {
      if (m.has(t.date)) m.get(t.date).push(t);
    }
    return m;
  }, [todos, weekMonday]);

  const days = weekDatesFromMonday(weekMonday);

  return (
    <>
      <header className="header header-below-nav">
        <h1 className="page-title">Week view</h1>
        <p className="tagline">Seven days at a glance — open a day to edit tasks</p>
      </header>

      {err && (
        <div className="banner error" role="alert">
          {err}
        </div>
      )}

      <section className="panel week-panel" aria-labelledby="week-heading">
        <div className="panel-head row week-nav-row">
          <h2 id="week-heading">This week</h2>
          <div className="week-nav">
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setWeekMonday((m) => addDaysLocal(m, -7))}
            >
              ← Prev
            </button>
            <button type="button" className="btn ghost small" onClick={() => setWeekMonday(mondayOfWeekLocal(todayISO()))}>
              Today
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setWeekMonday((m) => addDaysLocal(m, 7))}
            >
              Next →
            </button>
          </div>
        </div>

        {loading && !todos.length ? (
          <p className="muted center pad">Loading week…</p>
        ) : (
          <div className="week-grid">
            {days.map((d) => {
              const list = byDate.get(d) || [];
              const done = list.filter((t) => t.completed).length;
              const total = list.length;
              const rate = total === 0 ? null : Math.round((done / total) * 1000) / 10;
              return (
                <Link key={d} className="week-cell" to={{ pathname: "/", search: `?date=${encodeURIComponent(d)}` }}>
                  <div className="week-cell-date">{formatShort(d)}</div>
                  <div className="week-cell-stats">
                    <span className="week-cell-done">
                      {done}/{total}
                    </span>
                    {rate != null && <span className="week-cell-rate">{rate}%</span>}
                  </div>
                  <ul className="week-cell-preview">
                    {list.slice(0, 4).map((t) => (
                      <li key={t.id} className={t.completed ? "done" : ""}>
                        {t.title}
                      </li>
                    ))}
                    {list.length > 4 && <li className="week-cell-more">+{list.length - 4} more</li>}
                  </ul>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
