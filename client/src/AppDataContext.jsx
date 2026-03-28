import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  bulkImportTodos,
  createGoal as apiCreateGoal,
  createTodo,
  deleteGoal as apiDeleteGoal,
  deleteTodo,
  fetchGoals,
  fetchProgressReport,
  fetchStreaks,
  fetchTodos,
  applyDefaultsForDay as apiApplyDefaultsForDay,
  fetchDefaultDayStatus,
  fetchUserDefaultTemplates,
  putUserDefaultTemplates,
  restoreDefaultTask,
  suppressDefaultTask,
  toggleTodo,
  updateTodo,
} from "./api.js";
import { CHART_RANGE_OPTIONS } from "./reportConstants.js";
import { loadSettings } from "./settingsStorage.js";

const AppDataContext = createContext(null);

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function AppDataProvider({ children }) {
  const location = useLocation();
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [title, setTitle] = useState("");
  const [todos, setTodos] = useState([]);
  const [report, setReport] = useState([]);
  const [reportRangeDays, setReportRangeDays] = useState(() => {
    const d = loadSettings().report.defaultRangeDays;
    return CHART_RANGE_OPTIONS.includes(d) ? d : CHART_RANGE_OPTIONS[0];
  });
  const [chartMetric, setChartMetric] = useState("rate");
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState([]);
  const [editTimeSlot, setEditTimeSlot] = useState(null);
  const [editPinRank, setEditPinRank] = useState(null);

  const [streaks, setStreaks] = useState(null);
  const [goals, setGoals] = useState([]);
  const [habitsLoading, setHabitsLoading] = useState(false);
  const [userDefaultTasks, setUserDefaultTasks] = useState([]);
  const [defaultDayStatus, setDefaultDayStatus] = useState({ missingCount: 0, missingIds: [] });

  const loadTodos = useCallback(async () => {
    setErr(null);
    const data = await fetchTodos(selectedDate);
    setTodos(data);
  }, [selectedDate]);

  const loadUserDefaultTemplates = useCallback(async () => {
    const data = await fetchUserDefaultTemplates();
    setUserDefaultTasks(Array.isArray(data.tasks) ? data.tasks : []);
  }, []);

  const refreshDefaultDayStatus = useCallback(async () => {
    try {
      const s = await fetchDefaultDayStatus(selectedDate);
      setDefaultDayStatus({
        missingCount: Number(s.missingCount) || 0,
        missingIds: Array.isArray(s.missingIds) ? s.missingIds : [],
      });
    } catch {
      setDefaultDayStatus({ missingCount: 0, missingIds: [] });
    }
  }, [selectedDate]);

  const refreshReport = useCallback(async () => {
    const data = await fetchProgressReport(reportRangeDays);
    setReport(data);
  }, [reportRangeDays]);

  const refreshHabitsMetrics = useCallback(async () => {
    try {
      const [s, g] = await Promise.all([fetchStreaks(selectedDate), fetchGoals(selectedDate)]);
      setStreaks(s);
      setGoals(g);
    } catch (e) {
      setErr(e.message);
    }
  }, [selectedDate]);

  const isDailyPage = location.pathname === "/";
  const isReportPage = location.pathname === "/report";
  const loadHabitsMetrics = isDailyPage || isReportPage;

  useEffect(() => {
    if (!CHART_RANGE_OPTIONS.includes(reportRangeDays)) {
      setReportRangeDays(CHART_RANGE_OPTIONS[0]);
    }
  }, [reportRangeDays]);

  useEffect(() => {
    if (!isDailyPage) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        setErr(null);
        const [data] = await Promise.all([
          fetchTodos(selectedDate),
          loadUserDefaultTemplates(),
          refreshDefaultDayStatus(),
        ]);
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
  }, [selectedDate, isDailyPage, loadUserDefaultTemplates, refreshDefaultDayStatus]);

  useEffect(() => {
    if (!loadHabitsMetrics) return;
    let cancelled = false;
    (async () => {
      setHabitsLoading(true);
      try {
        const [s, g] = await Promise.all([fetchStreaks(selectedDate), fetchGoals(selectedDate)]);
        if (!cancelled) {
          setStreaks(s);
          setGoals(g);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setHabitsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, loadHabitsMetrics]);

  useEffect(() => {
    if (location.pathname !== "/report") return;
    let cancelled = false;
    (async () => {
      setReportLoading(true);
      try {
        setErr(null);
        const data = await fetchProgressReport(reportRangeDays);
        if (!cancelled) setReport(data);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, reportRangeDays]);

  async function afterTodoMutation() {
    await loadTodos();
    await refreshReport();
    await refreshHabitsMetrics();
    if (isDailyPage) await refreshDefaultDayStatus();
  }

  async function createTodoDetailed(body) {
    setErr(null);
    try {
      await createTodo({ ...body, date: body.date ?? selectedDate });
      setTitle("");
      await afterTodoMutation();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function onAdd(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await createTodoDetailed({ title: title.trim() });
  }

  async function onToggle(id) {
    setErr(null);
    try {
      await toggleTodo(id);
      await afterTodoMutation();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function onDelete(id) {
    setErr(null);
    try {
      await deleteTodo(id);
      if (editingId === id) {
        setEditingId(null);
        setEditTitle("");
        setEditTags([]);
        setEditTimeSlot(null);
        setEditPinRank(null);
      }
      await afterTodoMutation();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditTags(Array.isArray(t.tags) ? t.tags : []);
    setEditTimeSlot(t.timeSlot ?? null);
    setEditPinRank(t.pinRank ?? null);
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim()) return;
    setErr(null);
    try {
      await updateTodo(editingId, {
        title: editTitle.trim(),
        tags: editTags,
        timeSlot: editTimeSlot,
        pinRank: editPinRank,
      });
      setEditingId(null);
      setEditTitle("");
      setEditTags([]);
      setEditTimeSlot(null);
      setEditPinRank(null);
      await afterTodoMutation();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function onBulkImport(items) {
    setErr(null);
    try {
      await bulkImportTodos(items);
      await afterTodoMutation();
    } catch (e2) {
      setErr(e2.message || String(e2));
    }
  }

  async function onSuppressDefault(date, defaultId) {
    setErr(null);
    try {
      await suppressDefaultTask(date, defaultId);
      await afterTodoMutation();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function onRestoreDefault(date, defaultId) {
    setErr(null);
    try {
      await restoreDefaultTask(date, defaultId);
      await afterTodoMutation();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function onCreateGoal(payload) {
    setErr(null);
    try {
      await apiCreateGoal(payload);
      await refreshHabitsMetrics();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function onDeleteGoal(id) {
    setErr(null);
    try {
      await apiDeleteGoal(id);
      await refreshHabitsMetrics();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function saveUserDefaultTemplates(tasks) {
    setErr(null);
    const normalized = tasks
      .map((t) => ({
        id: String(t.id).trim(),
        title: String(t.title).trim(),
      }))
      .filter((t) => t.id && t.title);
    try {
      await putUserDefaultTemplates(normalized);
      await loadUserDefaultTemplates();
      await afterTodoMutation();
    } catch (e2) {
      setErr(e2.message);
      throw e2;
    }
  }

  async function onApplyDefaultsForDay() {
    setErr(null);
    try {
      await apiApplyDefaultsForDay(selectedDate);
      await afterTodoMutation();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  const value = {
    selectedDate,
    setSelectedDate,
    title,
    setTitle,
    todos,
    report,
    reportRangeDays,
    setReportRangeDays,
    chartMetric,
    setChartMetric,
    loading,
    reportLoading,
    err,
    setErr,
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
    onAdd,
    createTodoDetailed,
    onToggle,
    onDelete,
    startEdit,
    saveEdit,
    onBulkImport,
    streaks,
    goals,
    habitsLoading,
    refreshHabitsMetrics,
    onSuppressDefault,
    onRestoreDefault,
    onCreateGoal,
    onDeleteGoal,
    userDefaultTasks,
    loadUserDefaultTemplates,
    saveUserDefaultTemplates,
    defaultDayStatus,
    onApplyDefaultsForDay,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
