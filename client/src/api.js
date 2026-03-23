const raw = import.meta.env.VITE_API_URL ?? "";
const base = typeof raw === "string" ? raw.replace(/\/$/, "") : "";

async function handle(res) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function fetchTodos(date) {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return fetch(`${base}/api/todos${q}`).then(handle);
}

export function createTodo(body) {
  return fetch(`${base}/api/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handle);
}

export function updateTodo(id, body) {
  return fetch(`${base}/api/todos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(handle);
}

export function toggleTodo(id) {
  return fetch(`${base}/api/todos/${id}/toggle`, { method: "PATCH" }).then(handle);
}

export function deleteTodo(id) {
  return fetch(`${base}/api/todos/${id}`, { method: "DELETE" }).then(handle);
}

/** @param {number} [days] — 1–120, default 30 */
export function fetchProgressReport(days = 30) {
  const d = Number.isFinite(days) ? Math.min(120, Math.max(1, Math.floor(days))) : 30;
  return fetch(`${base}/api/reports/progress-30d?days=${encodeURIComponent(String(d))}`).then(handle);
}
