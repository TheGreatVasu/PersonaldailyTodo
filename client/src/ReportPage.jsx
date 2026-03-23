import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppData } from "./AppDataContext.jsx";

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

function chartHeightForViewport(v) {
  if (v.isShort && v.isMobile) return 180;
  if (v.isXs) return 200;
  if (v.isMobile) return 220;
  if (v.isTablet) return 260;
  if (v.isDesktop) return 300;
  return 280;
}

function formatChartLabel(iso) {
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

export default function ReportPage() {
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
