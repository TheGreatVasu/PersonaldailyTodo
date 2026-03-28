const SLOT_ORDER = { morning: 0, afternoon: 1, evening: 2 };

/** Oldest first — matches how items were saved (createdAt from MongoDB). */
export function sortTodosByDbOrder(todos) {
  return [...(todos || [])].sort((a, b) => {
    const aT = String(a.createdAt || "");
    const bT = String(b.createdAt || "");
    if (aT !== bT) return aT.localeCompare(bT);
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

/** Stable display order: pins 1–3, then time of day, then title. */
export function sortTodosForDisplay(todos) {
  return [...(todos || [])].sort((a, b) => {
    const aPin = a.pinRank != null ? Number(a.pinRank) : 999;
    const bPin = b.pinRank != null ? Number(b.pinRank) : 999;
    if (aPin !== bPin) return aPin - bPin;
    const as = a.timeSlot != null ? (SLOT_ORDER[a.timeSlot] ?? 99) : 99;
    const bs = b.timeSlot != null ? (SLOT_ORDER[b.timeSlot] ?? 99) : 99;
    if (as !== bs) return as - bs;
    return String(a.title || "").localeCompare(String(b.title || ""));
  });
}

export function collectTagsFromTodos(todos) {
  const s = new Set();
  for (const t of todos || []) {
    if (Array.isArray(t.tags)) {
      for (const x of t.tags) {
        if (x) s.add(String(x).toLowerCase());
      }
    }
  }
  return [...s].sort();
}

export function filterTodosByTag(todos, tag) {
  if (!tag) return todos;
  const t = String(tag).toLowerCase();
  return (todos || []).filter((x) => Array.isArray(x.tags) && x.tags.includes(t));
}

export function mondayOfWeekLocal(isoDate) {
  const [y, m, d] = isoDate.split(/[-T]/).map((x, i) => (i < 3 ? Number(x) : 0));
  const dt = new Date(y, m - 1, d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function addDaysLocal(isoDate, delta) {
  const [y, m, d] = isoDate.split(/[-T]/).map((x, i) => (i < 3 ? Number(x) : 0));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function weekDatesFromMonday(mondayISO) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.push(addDaysLocal(mondayISO, i));
  }
  return days;
}
