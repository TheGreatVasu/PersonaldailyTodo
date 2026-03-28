import ExcelJS from "exceljs";
import html2canvas from "html2canvas";
import { fetchTodosRange } from "./api.js";

/** Matches server `lastNDaysISO`: last N calendar days ending today. */
export function getReportDateRange(n) {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return { from: days[0], to: days[days.length - 1], dates: days };
}

function styleHeader(row) {
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF243044" },
  };
  row.font = { bold: true, color: { argb: "FFE8EDF5" } };
}

/**
 * @param {object} opts
 * @param {Array} opts.report — rows from /api/reports/progress-30d
 * @param {number} opts.reportRangeDays
 * @param {object} [opts.streaks]
 * @param {object} opts.reportInsights — { overallRate, totalCompleted, totalTasks, ... }
 * @param {HTMLElement | null} opts.chartCaptureEl — DOM node to screenshot (charts block)
 */
export async function downloadReportExcel({
  report,
  reportRangeDays,
  streaks,
  reportInsights,
  chartCaptureEl,
}) {
  const { from, to } = getReportDateRange(reportRangeDays);
  const todos = await fetchTodosRange(from, to);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Daily To-Do List";
  workbook.created = new Date();

  const overview = workbook.addWorksheet("Overview", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  overview.getColumn(1).width = 28;
  overview.getColumn(2).width = 36;
  overview.addRow(["Field", "Value"]);
  styleHeader(overview.getRow(1));
  overview.addRow(["Export generated (UTC)", new Date().toISOString()]);
  overview.addRow(["Report period", `${reportRangeDays} days`]);
  overview.addRow(["Date range (inclusive)", `${from} → ${to}`]);
  overview.addRow(["Overall completion %", reportInsights?.overallRate ?? "—"]);
  overview.addRow(["Avg day score %", reportInsights?.avgDayRate ?? "—"]);
  overview.addRow(["Total tasks (all days)", reportInsights?.totalTasks ?? 0]);
  overview.addRow(["Total completed (checkmarks)", reportInsights?.totalCompleted ?? 0]);
  overview.addRow(["Perfect days (100%)", reportInsights?.perfectDays ?? 0]);
  overview.addRow(["Days with at least one task", reportInsights?.activeDays ?? 0]);
  if (streaks) {
    overview.addRow(["Streak ≥1 done / day", streaks.streakAnyCompleted]);
    overview.addRow(["Streak 100% days", streaks.streakFullDay]);
    overview.addRow(["Streak core habits", streaks.streakCore]);
  }

  const sumSheet = workbook.addWorksheet("Daily summary", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sumSheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Total tasks", key: "total", width: 12 },
    { header: "Completed", key: "completed", width: 12 },
    { header: "Day completion %", key: "rate", width: 18 },
  ];
  styleHeader(sumSheet.getRow(1));
  report.forEach((r) =>
    sumSheet.addRow({
      date: r.date,
      total: r.total,
      completed: r.completed,
      rate: r.rate,
    })
  );

  const taskSheet = workbook.addWorksheet("Tasks", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  taskSheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "Task name", key: "title", width: 48 },
    { header: "Completed (Y/N)", key: "done", width: 14 },
    { header: "Task achievement %", key: "ach", width: 18 },
    { header: "Tags", key: "tags", width: 28 },
    { header: "Time slot", key: "slot", width: 14 },
    { header: "Pin rank", key: "pin", width: 10 },
    { header: "Default habit", key: "def", width: 14 },
  ];
  styleHeader(taskSheet.getRow(1));
  const sortedTodos = [...todos].sort((a, b) => {
    const da = String(a.date || "").localeCompare(String(b.date || ""));
    if (da !== 0) return da;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
  for (const t of sortedTodos) {
    taskSheet.addRow({
      date: t.date,
      title: t.title,
      done: t.completed ? "Yes" : "No",
      ach: t.completed ? 100 : 0,
      tags: Array.isArray(t.tags) ? t.tags.join(", ") : "",
      slot: t.timeSlot || "",
      pin: t.pinRank != null ? t.pinRank : "",
      def: t.defaultId ? "Yes" : "",
    });
  }

  const chartData = workbook.addWorksheet("Chart_data", {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  chartData.mergeCells("A1:E1");
  chartData.getCell("A1").value =
    "Use columns A–B (Date, Day completion %) in Excel: Insert → Recommended charts, or Insert → Line chart.";
  chartData.getCell("A1").font = { italic: true, size: 10 };
  chartData.getCell("A1").alignment = { wrapText: true };
  chartData.getRow(2).values = [
    "Date",
    "Day completion %",
    "Completed count",
    "Total tasks",
    "Cumulative completed",
  ];
  styleHeader(chartData.getRow(2));
  let cum = 0;
  report.forEach((r) => {
    cum += r.completed;
    chartData.addRow([r.date, r.rate, r.completed, r.total, cum]);
  });
  chartData.columns = [{ width: 14 }, { width: 18 }, { width: 16 }, { width: 12 }, { width: 20 }];

  if (chartCaptureEl && chartCaptureEl instanceof HTMLElement) {
    try {
      const isLight = document.documentElement.getAttribute("data-theme") === "light";
      const canvas = await html2canvas(chartCaptureEl, {
        backgroundColor: isLight ? "#f8fafc" : "#0f1419",
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        logging: false,
        useCORS: true,
        allowTaint: true,
      });
      const base64 = canvas.toDataURL("image/png").split(",")[1];
      const imgId = workbook.addImage({ base64, extension: "png" });
      const imgW = Math.min(920, canvas.width);
      const imgH = Math.round((canvas.height * imgW) / canvas.width);
      const dash = workbook.addWorksheet("Dashboard_charts_image");
      dash.addRow(["PNG snapshot of on-screen charts (trend, bars, line, pies)."]);
      dash.getRow(1).font = { italic: true, size: 10 };
      dash.addImage(imgId, {
        tl: { col: 0, row: 2 },
        ext: { width: imgW, height: Math.min(imgH, 1400) },
      });
    } catch (e) {
      console.warn("Chart screenshot failed:", e);
      const note = workbook.addWorksheet("Charts_note");
      note.addRow([
        "Chart image could not be embedded (browser security or graphics). Use Chart_data sheet to build charts in Excel.",
      ]);
      note.getRow(1).alignment = { wrapText: true };
    }
  } else {
    const note = workbook.addWorksheet("Charts_note");
    note.addRow([
      "No chart capture element. Use Chart_data for Excel charts, or export again from the report page.",
    ]);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const name = `daily-todo-report_${from}_to_${to}.xlsx`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}
