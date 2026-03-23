import "dotenv/config";
import express from "express";
import cors from "cors";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { MongoClient } from "mongodb";
import { DEFAULT_DAILY_TASKS } from "./defaultTasks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "daily_todo";

async function loadTodos() {
  return todosCollection.find({}, { projection: { _id: 0 } }).toArray();
}

async function saveTodos(todos) {
  await todosCollection.deleteMany({});
  if (todos.length) {
    await todosCollection.insertMany(todos, { ordered: false });
  }
}

function suppressionKey(date, defaultId) {
  return `${date}:${defaultId}`;
}

async function loadSuppressions() {
  const rows = await suppressionsCollection.find({}, { projection: { _id: 0, key: 1 } }).toArray();
  return new Set(rows.map((r) => r.key).filter(Boolean));
}

async function saveSuppressions(set) {
  await suppressionsCollection.deleteMany({});
  const docs = [...set].map((key) => ({ key }));
  if (docs.length) {
    await suppressionsCollection.insertMany(docs, { ordered: false });
  }
}

function templateDefForId(defaultId) {
  return DEFAULT_DAILY_TASKS.find((d) => d.id === defaultId);
}

/** Same logical title (avoids duplicate rows when one copy has defaultId and one does not). */
function normalizeTitle(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Merge duplicate default-template rows per day, then add any missing templates.
 * Duplicates happened when tasks existed without defaultId and the server added a second copy with defaultId.
 */
async function ensureDailyDefaultsForDates(dates) {
  const valid = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (!valid.length) return;
  const suppressed = await loadSuppressions();
  const todos = await loadTodos();
  const now = new Date().toISOString();
  let changed = false;
  const removeIds = new Set();

  for (const date of valid) {
    for (const def of DEFAULT_DAILY_TASKS) {
      const matches = todos.filter(
        (t) =>
          !removeIds.has(t.id) &&
          t.date === date &&
          (t.defaultId === def.id || normalizeTitle(t.title) === normalizeTitle(def.title))
      );
      if (matches.length === 0) continue;

      if (suppressed.has(suppressionKey(date, def.id))) {
        for (const m of matches) removeIds.add(m.id);
        changed = true;
        continue;
      }

      if (matches.length === 1) {
        const t = matches[0];
        if (t.defaultId !== def.id || t.title !== def.title) {
          t.defaultId = def.id;
          t.title = def.title;
          t.updatedAt = now;
          changed = true;
        }
        continue;
      }

      const keep = matches.find((x) => x.defaultId === def.id) ?? matches[0];
      const mergedCompleted = matches.some((m) => m.completed);
      for (const m of matches) {
        if (m.id !== keep.id) removeIds.add(m.id);
      }
      keep.defaultId = def.id;
      keep.title = def.title;
      keep.completed = mergedCompleted;
      keep.updatedAt = now;
      changed = true;
    }
  }

  let next = todos.filter((t) => !removeIds.has(t.id));

  for (const date of valid) {
    for (const def of DEFAULT_DAILY_TASKS) {
      if (suppressed.has(suppressionKey(date, def.id))) continue;
      const hasRow = next.some(
        (t) =>
          t.date === date &&
          (t.defaultId === def.id || normalizeTitle(t.title) === normalizeTitle(def.title))
      );
      if (hasRow) continue;
      next.push({
        id: randomUUID(),
        title: def.title,
        completed: false,
        date,
        defaultId: def.id,
        createdAt: now,
        updatedAt: now,
      });
      changed = true;
    }
  }

  if (changed) await saveTodos(next);
}

async function ensureDailyDefaults(date) {
  await ensureDailyDefaultsForDates([date]);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function lastNDaysISO(n) {
  const days = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is required. Set it in server/.env.");
}
const mongoClient = new MongoClient(MONGODB_URI);
await mongoClient.connect();
const db = mongoClient.db(MONGODB_DB);
const todosCollection = db.collection("todos");
const suppressionsCollection = db.collection("defaultSuppressions");
await Promise.all([
  todosCollection.createIndex({ id: 1 }, { unique: true }),
  suppressionsCollection.createIndex({ key: 1 }, { unique: true }),
]);

const app = express();
app.set("trust proxy", 1);

const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const corsOriginSet = new Set(corsOrigins.filter((o) => !o.includes("*")));
const corsOriginWildcards = corsOrigins
  .filter((o) => o.includes("*"))
  .map((o) => o.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));

function isAllowedCorsOrigin(origin) {
  // Non-browser clients / same-origin requests do not send Origin header.
  if (!origin) return true;
  if (!corsOrigins.length) return true;
  if (corsOriginSet.has(origin)) return true;
  return corsOriginWildcards.some((pattern) => new RegExp(`^${pattern}$`).test(origin));
}

app.use(
  cors({
    origin(origin, cb) {
      if (isAllowedCorsOrigin(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "rastogi-todo-api", db: "mongodb" });
});
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "rastogi-todo-api", db: "mongodb" });
});

app.get("/api/todos", async (req, res) => {
  try {
    const { date } = req.query;
    if (date && typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      await ensureDailyDefaults(date);
    }
    let todos = await loadTodos();
    if (date && typeof date === "string") {
      todos = todos.filter((t) => t.date === date);
    }
    res.json(todos);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/todos/:id", async (req, res) => {
  try {
    const todos = await loadTodos();
    const todo = todos.find((t) => t.id === req.params.id);
    if (!todo) return res.status(404).json({ error: "Not found" });
    res.json(todo);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/todos", async (req, res) => {
  try {
    const { title, date, completed } = req.body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
    const todos = await loadTodos();
    const now = new Date().toISOString();
    const todo = {
      id: randomUUID(),
      title: title.trim(),
      completed: Boolean(completed),
      date: day,
      createdAt: now,
      updatedAt: now,
    };
    todos.push(todo);
    await saveTodos(todos);
    res.status(201).json(todo);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/todos/:id", async (req, res) => {
  try {
    const { title, completed, date } = req.body;
    const todos = await loadTodos();
    const idx = todos.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    const cur = todos[idx];
    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title must be non-empty" });
      }
      cur.title = title.trim();
      if (cur.defaultId) {
        const def = templateDefForId(cur.defaultId);
        if (def && cur.title !== def.title) delete cur.defaultId;
      }
    }
    if (completed !== undefined) cur.completed = Boolean(completed);
    if (date !== undefined) {
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date must be YYYY-MM-DD" });
      }
      cur.date = date;
    }
    cur.updatedAt = new Date().toISOString();
    todos[idx] = cur;
    await saveTodos(todos);
    res.json(cur);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.patch("/api/todos/:id/toggle", async (req, res) => {
  try {
    const todos = await loadTodos();
    const idx = todos.findIndex((t) => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });
    todos[idx].completed = !todos[idx].completed;
    todos[idx].updatedAt = new Date().toISOString();
    await saveTodos(todos);
    res.json(todos[idx]);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/todos/:id", async (req, res) => {
  try {
    const todos = await loadTodos();
    const removed = todos.find((t) => t.id === req.params.id);
    if (!removed) return res.status(404).json({ error: "Not found" });
    if (removed.defaultId) {
      const suppressed = await loadSuppressions();
      suppressed.add(suppressionKey(removed.date, removed.defaultId));
      await saveSuppressions(suppressed);
    }
    const next = todos.filter((t) => t.id !== req.params.id);
    await saveTodos(next);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Progress report: per-day rate and counts. Query: days=1–120 (default 30). */
app.get("/api/reports/progress-30d", async (req, res) => {
  try {
    let n = 30;
    const raw = req.query.days;
    if (raw !== undefined && raw !== "") {
      const parsed = parseInt(String(raw), 10);
      if (!Number.isNaN(parsed)) n = Math.min(120, Math.max(1, parsed));
    }
    const days = lastNDaysISO(n);
    await ensureDailyDefaultsForDates(days);
    const todos = await loadTodos();
    const byDate = new Map();
    for (const d of days) {
      byDate.set(d, { total: 0, completed: 0 });
    }
    for (const t of todos) {
      if (!byDate.has(t.date)) continue;
      const row = byDate.get(t.date);
      row.total += 1;
      if (t.completed) row.completed += 1;
    }
    const report = days.map((date) => {
      const { total, completed } = byDate.get(date);
      const rate = total === 0 ? 0 : Math.round((completed / total) * 1000) / 10;
      return { date, total, completed, rate };
    });
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const clientDist = join(__dirname, "..", "client", "dist");
if (existsSync(join(clientDist, "index.html"))) {
  app.use(express.static(clientDist));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "Not found" });
    }
    res.sendFile(join(clientDist, "index.html"));
  });
}

const PORT = Number(process.env.PORT) || 3001;
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Rastogi Todo API listening on port ${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Close the other Node/server using it, or pick another port (e.g. PowerShell: $env:PORT=3002; npm run dev).`
    );
    process.exit(1);
  }
  throw err;
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    try {
      await mongoClient.close();
    } finally {
      process.exit(0);
    }
  });
}
