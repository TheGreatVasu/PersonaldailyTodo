import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  createTodo,
  deleteTodo,
  fetchProgressReport,
  fetchTodos,
  toggleTodo,
  updateTodo,
} from "./api.js";

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
  const [reportRangeDays, setReportRangeDays] = useState(30);
  const [chartMetric, setChartMetric] = useState("rate");
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");

  const loadTodos = useCallback(async () => {
    setErr(null);
    const data = await fetchTodos(selectedDate);
    setTodos(data);
  }, [selectedDate]);

  const refreshReport = useCallback(async () => {
    const data = await fetchProgressReport(reportRangeDays);
    setReport(data);
  }, [reportRangeDays]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        setErr(null);
        const data = await fetchTodos(selectedDate);
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
  }, [selectedDate]);

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

  async function onAdd(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setErr(null);
    try {
      await createTodo({ title: title.trim(), date: selectedDate });
      setTitle("");
      await loadTodos();
      await refreshReport();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function onToggle(id) {
    setErr(null);
    try {
      await toggleTodo(id);
      await loadTodos();
      await refreshReport();
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
      }
      await loadTodos();
      await refreshReport();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditTitle(t.title);
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim()) return;
    setErr(null);
    try {
      await updateTodo(editingId, { title: editTitle.trim() });
      setEditingId(null);
      setEditTitle("");
      await loadTodos();
      await refreshReport();
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
    onAdd,
    onToggle,
    onDelete,
    startEdit,
    saveEdit,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
