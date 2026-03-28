import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAppData } from "./AppDataContext.jsx";
import { useTheme } from "./ThemeContext.jsx";
import { CHART_RANGE_OPTIONS } from "./reportConstants.js";

/** Legend shows name + value (avoids SVG labels overlapping the legend on pie charts). */
function pieLegendFormatter(value, entry) {
  const p = entry?.payload;
  if (p && p.name != null && p.value != null) return `${p.name}: ${p.value}`;
  return value;
}

function getViewport() {
  if (typeof window === "undefined") {
    return {
      isXs: false,
      isMobile: false,
      isTablet: false,
      isDesktop: false,
      isWide: false,
      isXl: false,
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
    isWide: w >= 1280,
    isXl: w >= 1536,
    isShort: h <= 520,
  };
}

function useViewportFixed() {
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

function chartHeightMain(vp) {
  if (vp.isShort && vp.isMobile) return 200;
  if (vp.isXs) return 220;
  if (vp.isMobile) return 240;
  if (vp.isTablet) return 280;
  if (vp.isXl) return 340;
  if (vp.isWide) return 300;
  if (vp.isDesktop) return 280;
  return 260;
}

function chartHeightSecondary(vp) {
  const m = chartHeightMain(vp);
  return Math.max(200, m - 60);
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

function sanitizeId(id) {
  return String(id).replace(/:/g, "");
}

export default function ReportPage() {
  const reactId = useId();
  const uid = sanitizeId(reactId);
  const {
    report,
    reportRangeDays,
    setReportRangeDays,
    chartMetric,
    setChartMetric,
    reportLoading,
    err,
    streaks,
    habitsLoading,
  } = useAppData();

  const { theme } = useTheme();
  const chartPalette = useMemo(() => {
    const light = theme === "light";
    return {
      tooltipStyle: {
        background: light ? "#ffffff" : "#0c0e12",
        border: light ? "1px solid rgba(15,23,42,0.12)" : "1px solid rgba(255,255,255,0.08)",
        borderRadius: "8px",
        boxShadow: light ? "0 8px 24px rgba(15,23,42,0.1)" : undefined,
      },
      tooltipLabel: { color: light ? "#0f172a" : "#f1f5f9" },
      tooltipItem: { color: light ? "#334155" : "#e2e8f0" },
      grid: light ? "#cbd5e1" : "#2d3548",
      tick: light ? "#64748b" : "#94a3b8",
      legendMuted: light ? "#64748b" : "#94a3b8",
      pieLegend: light ? "#334155" : "#e2e8f0",
    };
  }, [theme]);

  const chartCaptureRef = useRef(null);
  const [excelExporting, setExcelExporting] = useState(false);

  const vp = useViewportFixed();
  const hMain = chartHeightMain(vp);
  const hSec = chartHeightSecondary(vp);
  const chartCompact = vp.isMobile;

  const chartData = useMemo(
    () =>
      report.map((r) => ({
        ...r,
        label: formatChartLabel(r.date),
        shortDate: r.date.slice(5),
        remaining: Math.max(0, r.total - r.completed),
      })),
    [report]
  );

  const chartDataCumulative = useMemo(() => {
    let cum = 0;
    return chartData.map((row) => {
      cum += row.completed;
      return { ...row, cumulativeDone: cum };
    });
  }, [chartData]);

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
      activeDays,
      daysInRange: report.length,
    };
  }, [report]);

  const dayQualityPie = useMemo(() => {
    let perfect = 0;
    let strong = 0;
    let weak = 0;
    let none = 0;
    for (const r of report) {
      if (r.total === 0) none += 1;
      else if (r.rate >= 100) perfect += 1;
      else if (r.rate >= 50) strong += 1;
      else weak += 1;
    }
    return [
      { name: "100% days", value: perfect, fill: "#4ade80" },
      { name: "50–99%", value: strong, fill: "#0d9488" },
      { name: "1–49%", value: weak, fill: "#fbbf24" },
      { name: "No tasks", value: none, fill: "#4a5568" },
    ].filter((x) => x.value > 0);
  }, [report]);

  const outcomePie = useMemo(() => {
    const done = reportInsights.totalCompleted;
    const left = Math.max(0, reportInsights.totalTasks - done);
    const out = [];
    if (done > 0) out.push({ name: "Completed", value: done, fill: "#4ade80" });
    if (left > 0) out.push({ name: "Not done", value: left, fill: "#64748b" });
    return out;
  }, [reportInsights]);

  const reportRowsNewestFirst = useMemo(() => [...report].reverse(), [report]);

  const chartMetricLabel =
    chartMetric === "rate" ? "% complete" : chartMetric === "completed" ? "Tasks done" : "Total tasks";

  const hasTaskData = reportInsights.totalTasks > 0;

  return (
    <>
      <header className="header header-below-nav">
        <h1 className="page-title">Report</h1>
        <p className="tagline">
          Analytics for the last {reportRangeDays} days — trends, volume, streaks, and daily detail
        </p>
      </header>

      {err && (
        <div className="banner error" role="alert">
          {err}
        </div>
      )}

      <section className="panel report-panel report-panel-v2" aria-labelledby="report-heading">
        <div className="panel-head report-panel-head">
          <div>
            <h2 id="report-heading">Analytics dashboard</h2>
            <span className="hint">Data updates when you change the range. Charts use the same period.</span>
          </div>
          <div className="report-head-actions">
            <div className="report-range-toolbar" role="toolbar" aria-label="Report range">
              <span className="chart-filter-label" id="report-range-lbl">
                Range
              </span>
              <div className="chart-filter-buttons" role="group" aria-labelledby="report-range-lbl">
                {CHART_RANGE_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`chart-filter-btn ${reportRangeDays === d ? "active" : ""}`}
                    onClick={() => setReportRangeDays(d)}
                    aria-pressed={reportRangeDays === d}
                    disabled={reportLoading}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="report-download-excel-btn"
              disabled={reportLoading || excelExporting}
              onClick={async () => {
                setExcelExporting(true);
                try {
                  const { downloadReportExcel } = await import("./reportExportExcel.js");
                  await downloadReportExcel({
                    report,
                    reportRangeDays,
                    streaks,
                    reportInsights,
                    chartCaptureEl: chartCaptureRef.current,
                  });
                } catch (e) {
                  console.error(e);
                } finally {
                  setExcelExporting(false);
                }
              }}
            >
              {excelExporting ? "Preparing Excel…" : "Download Excel"}
            </button>
          </div>
        </div>

        {reportLoading && !report.length ? (
          <div className="report-loading" aria-busy="true">
            <div className="report-loading-inner">
              <span className="report-loading-dot" />
              <span className="report-loading-dot" />
              <span className="report-loading-dot" />
            </div>
            <p className="muted center">Loading report data…</p>
          </div>
        ) : (
          <>
            {!hasTaskData && (
              <p className="report-empty-hint muted">
                No tasks in this period yet. Add tasks on the Daily page — stats will appear here.
              </p>
            )}

            <div ref={chartCaptureRef} className="report-excel-capture">
            <div className="report-kpi-grid" role="group" aria-label="Summary metrics">
              <div className="report-kpi">
                <span className="report-kpi-value">{reportInsights.overallRate}%</span>
                <span className="report-kpi-label">Overall completion</span>
              </div>
              <div className="report-kpi">
                <span className="report-kpi-value">{reportInsights.avgDayRate}%</span>
                <span className="report-kpi-label">Avg day score</span>
              </div>
              <div className="report-kpi">
                <span className="report-kpi-value">
                  {reportInsights.bestDate != null ? `${reportInsights.bestRate}%` : "—"}
                </span>
                <span className="report-kpi-label">
                  Best day
                  {reportInsights.bestDate && (
                    <span className="report-kpi-sub">{formatChartLabel(reportInsights.bestDate)}</span>
                  )}
                </span>
              </div>
              <div className="report-kpi">
                <span className="report-kpi-value">{reportInsights.perfectDays}</span>
                <span className="report-kpi-label">Perfect days</span>
              </div>
              <div className="report-kpi">
                <span className="report-kpi-value">
                  {reportInsights.totalCompleted}/{reportInsights.totalTasks}
                </span>
                <span className="report-kpi-label">Done / total tasks</span>
              </div>
              <div className="report-kpi">
                <span className="report-kpi-value">{reportInsights.activeDays}</span>
                <span className="report-kpi-label">Days with tasks</span>
              </div>
            </div>

            {streaks && !habitsLoading && (
              <div className="report-streak-strip" role="group" aria-label="Streaks">
                <div className="report-streak-item">
                  <span className="report-streak-val">{streaks.streakAnyCompleted}</span>
                  <span className="report-streak-lbl">Days in a row (≥1 done)</span>
                </div>
                <div className="report-streak-item">
                  <span className="report-streak-val">{streaks.streakFullDay}</span>
                  <span className="report-streak-lbl">100% days streak</span>
                </div>
                <div className="report-streak-item">
                  <span className="report-streak-val">{streaks.streakCore}</span>
                  <span className="report-streak-lbl">Core habits streak</span>
                </div>
              </div>
            )}

            <div className={`report-chart-card ${reportLoading ? "is-loading" : ""}`}>
              <div className="report-chart-card-head">
                <div>
                  <h3 className="report-chart-title">Completion trend</h3>
                  <p className="hint report-chart-desc">
                    {chartMetric === "rate"
                      ? "Daily completion rate"
                      : chartMetric === "completed"
                        ? "Tasks completed per day"
                        : "Total tasks scheduled per day"}
                  </p>
                </div>
                <div className="chart-filter-buttons report-metric-toggle" role="group" aria-label="Trend metric">
                  {[
                    { key: "rate", label: "% Done" },
                    { key: "completed", label: "Done" },
                    { key: "total", label: "Total" },
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
              <div className="chart-wrap chart-wrap-report-main">
                <ResponsiveContainer width="100%" height={hMain}>
                  <AreaChart
                    data={chartData}
                    margin={
                      chartCompact
                        ? { top: 8, right: 8, left: -8, bottom: 4 }
                        : { top: 12, right: 16, left: 4, bottom: 8 }
                    }
                  >
                    <defs>
                      <linearGradient id={`areaGrad-${uid}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartPalette.grid} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: chartPalette.tick, fontSize: chartCompact ? 9 : 11 }}
                      interval="preserveStartEnd"
                      minTickGap={chartCompact ? 8 : 28}
                      angle={chartCompact ? -35 : 0}
                      textAnchor={chartCompact ? "end" : "middle"}
                      height={chartCompact ? 52 : 32}
                    />
                    <YAxis
                      domain={chartMetric === "rate" ? [0, 100] : [0, "dataMax"]}
                      tick={{ fill: chartPalette.tick, fontSize: chartCompact ? 10 : 11 }}
                      width={chartMetric === "rate" ? (chartCompact ? 32 : 40) : chartCompact ? 36 : 44}
                      unit={chartMetric === "rate" ? "%" : ""}
                      allowDecimals={chartMetric !== "rate"}
                    />
                    <Tooltip
                      contentStyle={chartPalette.tooltipStyle}
                      labelStyle={chartPalette.tooltipLabel}
                      itemStyle={chartPalette.tooltipItem}
                      formatter={(value, _name, item) => {
                        const p = item?.payload;
                        if (chartMetric === "rate") {
                          const extra = p ? ` (${p.completed}/${p.total} tasks)` : "";
                          return [`${value}%${extra}`, chartMetricLabel];
                        }
                        const extra = p ? ` · ${p.rate}%` : "";
                        const v =
                          chartMetric === "completed"
                            ? `${value} done${extra}`
                            : `${value} scheduled${extra}`;
                        return [v, chartMetricLabel];
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey={chartMetric}
                      stroke="#0d9488"
                      strokeWidth={2}
                      fill={`url(#areaGrad-${uid})`}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="report-charts-row">
              <div className={`report-chart-card ${reportLoading ? "is-loading" : ""}`}>
                <h3 className="report-chart-title">Done vs scheduled</h3>
                <p className="hint report-chart-desc">Per-day completed tasks vs total scheduled</p>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={hSec}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: chartCompact ? -8 : 0, bottom: chartCompact ? 48 : 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartPalette.grid} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: chartPalette.tick, fontSize: chartCompact ? 9 : 10 }}
                        interval="preserveStartEnd"
                        angle={chartCompact ? -40 : 0}
                        textAnchor={chartCompact ? "end" : "middle"}
                        height={chartCompact ? 56 : 28}
                      />
                      <YAxis
                        tick={{ fill: chartPalette.tick, fontSize: 10 }}
                        allowDecimals={false}
                        width={36}
                      />
                      <Tooltip
                        contentStyle={chartPalette.tooltipStyle}
                        labelStyle={chartPalette.tooltipLabel}
                        itemStyle={chartPalette.tooltipItem}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px", color: chartPalette.legendMuted }} />
                      <Bar dataKey="completed" name="Done" fill="#4ade80" radius={[4, 4, 0, 0]} maxBarSize={28} />
                      <Bar dataKey="total" name="Total" fill="#0d9488" opacity={0.42} radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={`report-chart-card ${reportLoading ? "is-loading" : ""}`}>
                <h3 className="report-chart-title">Cumulative tasks done</h3>
                <p className="hint report-chart-desc">Running total of completed tasks across the range</p>
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={hSec}>
                    <LineChart
                      data={chartDataCumulative}
                      margin={{ top: 8, right: 12, left: chartCompact ? -8 : 4, bottom: chartCompact ? 48 : 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={chartPalette.grid} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: chartPalette.tick, fontSize: chartCompact ? 9 : 10 }}
                        interval="preserveStartEnd"
                        angle={chartCompact ? -40 : 0}
                        textAnchor={chartCompact ? "end" : "middle"}
                        height={chartCompact ? 56 : 28}
                      />
                      <YAxis tick={{ fill: chartPalette.tick, fontSize: 10 }} width={40} allowDecimals={false} />
                      <Tooltip
                        contentStyle={chartPalette.tooltipStyle}
                        labelStyle={chartPalette.tooltipLabel}
                        itemStyle={chartPalette.tooltipItem}
                        formatter={(v) => [`${v} tasks`, "Cumulative done"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulativeDone"
                        name="Cumulative done"
                        stroke="#2dd4bf"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "#2dd4bf" }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="report-charts-row report-pie-row">
              <div className={`report-chart-card report-chart-card-pie ${reportLoading ? "is-loading" : ""}`}>
                <h3 className="report-chart-title">Task outcomes</h3>
                <p className="hint report-chart-desc">Share of completed vs open tasks (all days)</p>
                <div className="chart-wrap chart-wrap-pie">
                  {outcomePie.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.min(hSec, 280)}>
                      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                        <Pie
                          data={outcomePie}
                          cx="50%"
                          cy="50%"
                          innerRadius={chartCompact ? 44 : 56}
                          outerRadius={chartCompact ? 72 : 88}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                          label={false}
                        >
                          {outcomePie.map((e, i) => (
                            <Cell key={e.name} fill={e.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={chartPalette.tooltipStyle}
                          labelStyle={chartPalette.tooltipLabel}
                          itemStyle={chartPalette.tooltipItem}
                          formatter={(value, name) => [`${value} tasks`, name]}
                        />
                        <Legend
                          verticalAlign="bottom"
                          align="center"
                          layout="horizontal"
                          wrapperStyle={{
                            color: chartPalette.pieLegend,
                            fontSize: "12px",
                            paddingTop: "14px",
                            lineHeight: 1.65,
                          }}
                          formatter={pieLegendFormatter}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="muted center pad">No tasks to chart</p>
                  )}
                </div>
              </div>

              <div className={`report-chart-card report-chart-card-pie ${reportLoading ? "is-loading" : ""}`}>
                <h3 className="report-chart-title">Day quality mix</h3>
                <p className="hint report-chart-desc">How many days landed in each completion band</p>
                <div className="chart-wrap chart-wrap-pie">
                  {dayQualityPie.length > 0 ? (
                    <ResponsiveContainer width="100%" height={Math.min(hSec, 280)}>
                      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                        <Pie
                          data={dayQualityPie}
                          cx="50%"
                          cy="50%"
                          innerRadius={chartCompact ? 44 : 56}
                          outerRadius={chartCompact ? 72 : 88}
                          paddingAngle={2}
                          dataKey="value"
                          nameKey="name"
                          label={false}
                        >
                          {dayQualityPie.map((e) => (
                            <Cell key={e.name} fill={e.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={chartPalette.tooltipStyle}
                          labelStyle={chartPalette.tooltipLabel}
                          itemStyle={chartPalette.tooltipItem}
                          formatter={(value, name) => [`${value} days`, name]}
                        />
                        <Legend
                          verticalAlign="bottom"
                          align="center"
                          layout="horizontal"
                          wrapperStyle={{
                            color: chartPalette.pieLegend,
                            fontSize: "12px",
                            paddingTop: "14px",
                            lineHeight: 1.65,
                          }}
                          formatter={pieLegendFormatter}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="muted center pad">No data</p>
                  )}
                </div>
              </div>
            </div>
            </div>

            <div className="report-table-section">
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
            </div>
          </>
        )}
      </section>
    </>
  );
}
