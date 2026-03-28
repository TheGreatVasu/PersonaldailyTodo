const raw = import.meta.env.VITE_API_URL ?? "";
const base = typeof raw === "string" ? raw.replace(/\/$/, "") : "";

function getToken() {
  try {
    return typeof window !== "undefined" ? window.localStorage.getItem("token") : null;
  } catch {
    return null;
  }
}

function authHeaders(extra = {}) {
  const token = getToken();
  if (!token) return extra;
  return { ...extra, Authorization: `Bearer ${token}` };
}

async function handle(res) {
  const text = await res.text().catch(() => "");

  if (res.status === 204) return null;

  if (!res.ok) {
    if (res.status === 401) {
      try {
        window.localStorage.removeItem("token");
      } catch {
        // ignore
      }
    }

    if (!text) throw new Error(res.statusText || "Request failed");
    try {
      const err = JSON.parse(text);
      throw new Error(err.error || res.statusText || "Request failed");
    } catch {
      throw new Error(text || res.statusText || "Request failed");
    }
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || res.statusText || "Invalid JSON response");
  }
}

export function fetchTodos(date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return fetch(`${base}/api/todos${q}`, { headers: authHeaders() }).then(handle);
}

export function fetchTodosRange(from, to) {
  return fetch(
    `${base}/api/todos?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { headers: authHeaders() }
  ).then(handle);
}

export function fetchStreaks(date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return fetch(`${base}/api/stats/streaks${q}`, { headers: authHeaders() }).then(handle);
}

export function fetchGoals(refDate) {
  const q = refDate ? `?date=${encodeURIComponent(refDate)}` : "";
  return fetch(`${base}/api/goals${q}`, { headers: authHeaders() }).then(handle);
}

export function createGoal(body) {
  return fetch(`${base}/api/goals`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  }).then(handle);
}

export function deleteGoal(id) {
  return fetch(`${base}/api/goals/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).then(handle);
}

export function suppressDefaultTask(date, defaultId) {
  return fetch(`${base}/api/todos/default-suppress`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ date, defaultId }),
  }).then(handle);
}

export function restoreDefaultTask(date, defaultId) {
  return fetch(
    `${base}/api/todos/default-suppress?date=${encodeURIComponent(date)}&defaultId=${encodeURIComponent(defaultId)}`,
    { method: "DELETE", headers: authHeaders() }
  ).then(handle);
}

export function loginUser({ email, password }) {
  return fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password }),
  }).then(handle);
}

export function registerUser({ email, password }) {
  return fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password }),
  }).then(handle);
}

/** Per-user daily default habit templates (seeded from server defaults until customized). */
export function fetchUserDefaultTemplates() {
  return fetch(`${base}/api/user/default-templates`, { headers: authHeaders() }).then(handle);
}

export function putUserDefaultTemplates(tasks) {
  return fetch(`${base}/api/user/default-templates`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ tasks }),
  }).then(handle);
}

/** How many default-habit rows are not on this day’s list yet (and not skipped). */
export function fetchDefaultDayStatus(date) {
  return fetch(`${base}/api/todos/default-status?date=${encodeURIComponent(date)}`, {
    headers: authHeaders(),
  }).then(handle);
}

/** Add all missing default habits for this day (respects “Skip today”). */
export function applyDefaultsForDay(date) {
  return fetch(`${base}/api/todos/apply-defaults-for-day`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ date }),
  }).then(handle);
}

export function createTodo(body) {
  return fetch(`${base}/api/todos`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  }).then(handle);
}

export function bulkImportTodos(items) {
  return fetch(`${base}/api/todos/bulk`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ items }),
  }).then(handle);
}

export function updateTodo(id, body) {
  return fetch(`${base}/api/todos/${id}`, {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  }).then(handle);
}

export function toggleTodo(id) {
  return fetch(`${base}/api/todos/${id}/toggle`, {
    method: "PATCH",
    headers: authHeaders(),
  }).then(handle);
}

export function deleteTodo(id) {
  return fetch(`${base}/api/todos/${id}`, { method: "DELETE", headers: authHeaders() }).then(handle);
}

/** @param {number} [days] — 1–120, default 7 */
export function fetchProgressReport(days = 7) {
  const d = Number.isFinite(days) ? Math.min(120, Math.max(1, Math.floor(days))) : 7;
  return fetch(`${base}/api/reports/progress-30d?days=${encodeURIComponent(String(d))}`, {
    headers: authHeaders(),
  }).then(handle);
}
