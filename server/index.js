import "dotenv/config";
import express from "express";
import cors from "cors";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { MongoClient } from "mongodb";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { DEFAULT_DAILY_TASKS } from "./defaultTasks.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "daily_todo";
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const BCRYPT_ROUNDS = Number.parseInt(process.env.BCRYPT_ROUNDS || "10", 10);

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required. Set it in server/.env.");
}

function suppressionKey(date, defaultId) {
  return `${date}:${defaultId}`;
}

/** Same logical title (avoids duplicate rows when one copy has defaultId and one does not). */
function normalizeTitle(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, " ");
}

function addDaysISO(iso, delta) {
  const d = new Date(`${iso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function startOfWeekMondayUTC(isoDate) {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function endOfWeekSundayUTC(isoDate) {
  return addDaysISO(startOfWeekMondayUTC(isoDate), 6);
}

function startOfMonthUTC(isoDate) {
  return `${isoDate.slice(0, 7)}-01`;
}

function endOfMonthUTC(isoDate) {
  const y = Number.parseInt(isoDate.slice(0, 4), 10);
  const m = Number.parseInt(isoDate.slice(5, 7), 10);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function normalizeTags(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const x of input) {
    if (typeof x !== "string") continue;
    const t = x.trim().toLowerCase().replace(/^#/, "");
    if (t && t.length <= 32 && /^[\w-]+$/.test(t) && out.length < 24) out.push(t);
  }
  return [...new Set(out)];
}

const TIME_SLOTS = new Set(["morning", "afternoon", "evening"]);

async function countPinnedForDay(userId, date, excludeId) {
  const q = { userId, date, pinRank: { $gte: 1, $lte: 3 } };
  if (excludeId) q.id = { $ne: excludeId };
  return todosCollection.countDocuments(q);
}

/** MongoDB Node driver 7+ returns the document directly; older drivers used `{ value }`. */
function findOneAndUpdateDoc(result) {
  if (result == null) return null;
  if (Object.prototype.hasOwnProperty.call(result, "value")) return result.value;
  return result;
}

function validateDefaultTasksPayload(tasks) {
  if (!Array.isArray(tasks)) return "tasks must be an array";
  if (tasks.length > 40) return "at most 40 default habits";
  const seen = new Set();
  for (const item of tasks) {
    if (!item || typeof item !== "object") return "invalid task";
    const id = item.id;
    const title = item.title;
    if (typeof id !== "string" || id.length < 1 || id.length > 80) return "invalid id";
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return "id may only contain letters, numbers, underscore, hyphen";
    if (typeof title !== "string" || title.trim().length < 1 || title.length > 500) return "each title must be 1–500 characters";
    if (seen.has(id)) return "duplicate habit id";
    seen.add(id);
  }
  return null;
}

/**
 * Per-user daily template list. First access seeds from global DEFAULT_DAILY_TASKS.
 * @returns {Promise<{ id: string, title: string }[]>}
 */
async function getOrCreateDefaultTasksForUser(userId) {
  const doc = await userDefaultTemplatesCollection.findOne({ userId }, { projection: { _id: 0, tasks: 1 } });
  if (doc && Array.isArray(doc.tasks)) {
    return doc.tasks;
  }
  const tasks = DEFAULT_DAILY_TASKS.map((d) => ({ id: d.id, title: d.title }));
  try {
    await userDefaultTemplatesCollection.insertOne({
      userId,
      tasks,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    if (e.code === 11000) {
      const again = await userDefaultTemplatesCollection.findOne({ userId }, { projection: { _id: 0, tasks: 1 } });
      if (again && Array.isArray(again.tasks)) return again.tasks;
    }
    throw e;
  }
  return tasks;
}

/**
 * Merge duplicate default-template rows per user/day.
 * Does not insert missing templates — use insertMissingDefaultTodosForUserDay when the user asks to add defaults for that day.
 */
async function ensureDailyDefaultsForUser(userId, dates) {
  const valid = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  if (!valid.length) return;

  const templateList = await getOrCreateDefaultTasksForUser(userId);

  const supRows = await suppressionsCollection
    .find({ userId }, { projection: { _id: 0, key: 1 } })
    .toArray();
  const suppressed = new Set(supRows.map((r) => r.key).filter(Boolean));

  let todos = await todosCollection
    .find({ userId, date: { $in: valid } }, { projection: { _id: 0 } })
    .toArray();

  const now = new Date().toISOString();
  const removeIds = new Set();

  for (const date of valid) {
    if (isFutureDay(date)) continue;
    for (const def of templateList) {
      const matches = todos.filter(
        (t) =>
          !removeIds.has(t.id) &&
          t.date === date &&
          (t.defaultId === def.id || normalizeTitle(t.title) === normalizeTitle(def.title))
      );
      if (matches.length === 0) continue;

      if (suppressed.has(suppressionKey(date, def.id))) {
        for (const m of matches) removeIds.add(m.id);
        continue;
      }

      if (matches.length === 1) {
        const t = matches[0];
        if (t.defaultId !== def.id || t.title !== def.title) {
          await todosCollection.updateOne(
            { userId, id: t.id },
            { $set: { defaultId: def.id, title: def.title, updatedAt: now } }
          );
        }
        continue;
      }

      const keep = matches.find((x) => x.defaultId === def.id) ?? matches[0];
      const mergedCompleted = matches.some((m) => m.completed);
      for (const m of matches) {
        if (m.id !== keep.id) removeIds.add(m.id);
      }
      await todosCollection.updateOne(
        { userId, id: keep.id },
        { $set: { defaultId: def.id, title: def.title, completed: mergedCompleted, updatedAt: now } }
      );
    }
  }

  if (removeIds.size) {
    await todosCollection.deleteMany({ userId, id: { $in: [...removeIds] } });
  }
}

/** Insert one template row for a day if not already present (used after “restore” clears suppression). */
async function insertDefaultTodoIfMissing(userId, date, def) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if (isFutureDay(date)) return false;
  const todos = await todosCollection.find({ userId, date }, { projection: { _id: 0 } }).toArray();
  const hasRow = todos.some(
    (t) => t.defaultId === def.id || normalizeTitle(t.title) === normalizeTitle(def.title)
  );
  if (hasRow) return false;
  const ts = new Date().toISOString();
  await todosCollection.insertOne({
    id: randomUUID(),
    title: def.title,
    completed: false,
    date,
    userId,
    defaultId: def.id,
    tags: [],
    timeSlot: null,
    pinRank: null,
    createdAt: ts,
    updatedAt: ts,
  });
  return true;
}

/**
 * Insert all template todos for a day that are not skipped and not already on the list.
 * @returns {number} how many rows were inserted
 */
async function insertMissingDefaultTodosForUserDay(userId, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 0;
  if (isFutureDay(date)) return 0;
  const templateList = await getOrCreateDefaultTasksForUser(userId);
  const supRows = await suppressionsCollection.find({ userId }, { projection: { _id: 0, key: 1 } }).toArray();
  const suppressed = new Set(supRows.map((r) => r.key).filter(Boolean));
  let todos = await todosCollection.find({ userId, date }, { projection: { _id: 0 } }).toArray();
  const ts = new Date().toISOString();
  let inserted = 0;
  for (const def of templateList) {
    if (suppressed.has(suppressionKey(date, def.id))) continue;
    const hasRow = todos.some(
      (t) => t.defaultId === def.id || normalizeTitle(t.title) === normalizeTitle(def.title)
    );
    if (hasRow) continue;
    const newTodo = {
      id: randomUUID(),
      title: def.title,
      completed: false,
      date,
      userId,
      defaultId: def.id,
      tags: [],
      timeSlot: null,
      pinRank: null,
      createdAt: ts,
      updatedAt: ts,
    };
    await todosCollection.insertOne(newTodo);
    todos.push(newTodo);
    inserted++;
  }
  return inserted;
}

async function getDefaultMissingStatus(userId, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { missingCount: 0, missingIds: [] };
  }
  if (isFutureDay(date)) {
    return { missingCount: 0, missingIds: [] };
  }
  const templateList = await getOrCreateDefaultTasksForUser(userId);
  const supRows = await suppressionsCollection.find({ userId }, { projection: { _id: 0, key: 1 } }).toArray();
  const suppressed = new Set(supRows.map((r) => r.key).filter(Boolean));
  const todos = await todosCollection.find({ userId, date }, { projection: { _id: 0, defaultId: 1, title: 1 } }).toArray();
  const missingIds = [];
  for (const def of templateList) {
    if (suppressed.has(suppressionKey(date, def.id))) continue;
    const hasRow = todos.some(
      (t) => t.defaultId === def.id || normalizeTitle(t.title) === normalizeTitle(def.title)
    );
    if (!hasRow) missingIds.push(def.id);
  }
  return { missingCount: missingIds.length, missingIds };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** True if dateStr is a calendar day strictly after the server's UTC "today" (YYYY-MM-DD compare). */
function isFutureDay(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && dateStr > todayISO();
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
const usersCollection = db.collection("users");
const todosCollection = db.collection("todos");
const suppressionsCollection = db.collection("defaultSuppressions");
const goalsCollection = db.collection("goals");
const userDefaultTemplatesCollection = db.collection("userDefaultTemplates");
await suppressionsCollection.dropIndex("key_1").catch(() => {});
await Promise.all([
  usersCollection.createIndex({ email: 1 }, { unique: true }),
  todosCollection.createIndex({ id: 1 }, { unique: true }),
  todosCollection.createIndex({ userId: 1, id: 1 }, { unique: true }),
  todosCollection.createIndex({ userId: 1, date: 1 }),
  suppressionsCollection.createIndex({ userId: 1, key: 1 }, { unique: true }),
  goalsCollection.createIndex({ userId: 1, id: 1 }, { unique: true }),
  userDefaultTemplatesCollection.createIndex({ userId: 1 }, { unique: true }),
]);
await suppressionsCollection.deleteMany({ userId: { $exists: false } }).catch(() => {});

const app = express();
app.set("trust proxy", 1);

const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const defaultCorsOrigins = ["http://localhost:5173", "http://localhost:3000", "https://*.vercel.app"];
// Always include a safe baseline for this app so production won't break
// due to a missing/incorrect CORS_ORIGINS env var.
const effectiveCorsOrigins = [...new Set([...corsOrigins, ...defaultCorsOrigins])];
const corsOriginSet = new Set(effectiveCorsOrigins.filter((o) => !o.includes("*")));
const corsOriginWildcards = effectiveCorsOrigins
  .filter((o) => o.includes("*"))
  .map((o) => o.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));

function isAllowedCorsOrigin(origin) {
  // Non-browser clients / same-origin requests do not send Origin header.
  if (!origin) return true;
  if (corsOriginSet.has(origin)) return true;
  return corsOriginWildcards.some((pattern) => new RegExp(`^${pattern}$`).test(origin));
}

app.use(
  cors({
    origin(origin, cb) {
      // Never error here; returning false just means CORS headers won't be set.
      // Throwing an error causes Express to return 500 (which your production logs show).
      return cb(null, isAllowedCorsOrigin(origin));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "rastogi-todo-api", db: "mongodb" });
});
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "rastogi-todo-api", db: "mongodb" });
});

function getBearerToken(req) {
  const h = req.headers.authorization;
  if (typeof h !== "string") return null;
  const m = h.match(/^Bearer (.+)$/);
  return m ? m[1] : null;
}

function requireAuth(req, res, next) {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    return next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await usersCollection.findOne({ email: normalizedEmail });
    if (existing) return res.status(409).json({ error: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = {
      id: randomUUID(),
      email: normalizedEmail,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    await usersCollection.insertOne(user);

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || typeof email !== "string" || !password || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const normalizedEmail = email.trim().toLowerCase();

    const user = await usersCollection.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Protect user data endpoints
app.use("/api/todos", requireAuth);
app.use("/api/reports", requireAuth);
app.use("/api/goals", requireAuth);
app.use("/api/stats", requireAuth);
app.use("/api/user", requireAuth);

app.get("/api/user/default-templates", async (req, res) => {
  try {
    const tasks = await getOrCreateDefaultTasksForUser(req.userId);
    res.json({ tasks });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/user/default-templates", async (req, res) => {
  try {
    const tasks = req.body?.tasks;
    const verr = validateDefaultTasksPayload(tasks);
    if (verr) return res.status(400).json({ error: verr });
    await userDefaultTemplatesCollection.updateOne(
      { userId: req.userId },
      { $set: { tasks, updatedAt: new Date().toISOString() }, $setOnInsert: { userId: req.userId } },
      { upsert: true }
    );
    res.json({ tasks });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/todos", async (req, res) => {
  try {
    const { date, from, to } = req.query;
    const filter = { userId: req.userId };

    if (from && to && typeof from === "string" && typeof to === "string") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
      }
      if (from > to) return res.status(400).json({ error: "from must be <= to" });
      const span = [];
      let cur = from;
      while (cur <= to) {
        span.push(cur);
        cur = addDaysISO(cur, 1);
        if (span.length > 120) {
          return res.status(400).json({ error: "range must be at most 120 days" });
        }
      }
      await ensureDailyDefaultsForUser(req.userId, span);
      filter.date = { $gte: from, $lte: to };
    } else if (date && typeof date === "string") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date must be YYYY-MM-DD" });
      }
      await ensureDailyDefaultsForUser(req.userId, [date]);
      filter.date = date;
    }

    let todos = await todosCollection
      .find(filter, { projection: { _id: 0 } })
      .sort({ createdAt: 1, id: 1 })
      .toArray();
    todos = todos.filter((t) => !(isFutureDay(t.date) && t.defaultId));
    res.json(todos);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/todos/default-suppress", async (req, res) => {
  try {
    const { date, defaultId } = req.body ?? {};
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }
    if (!defaultId || typeof defaultId !== "string") {
      return res.status(400).json({ error: "defaultId is required" });
    }
    if (isFutureDay(date)) {
      return res.status(400).json({ error: "Default habits cannot be skipped on a future day" });
    }
    const userTemplates = await getOrCreateDefaultTasksForUser(req.userId);
    const def = userTemplates.find((d) => d.id === defaultId);
    if (!def) {
      return res.status(400).json({ error: "unknown defaultId" });
    }
    const key = suppressionKey(date, defaultId);
    await suppressionsCollection.updateOne(
      { userId: req.userId, key },
      { $setOnInsert: { userId: req.userId, key } },
      { upsert: true }
    );
    await todosCollection.deleteMany({
      userId: req.userId,
      date,
      $or: [{ defaultId }, { title: def.title }],
    });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/todos/default-suppress", async (req, res) => {
  try {
    const { date, defaultId } = req.query;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }
    if (!defaultId || typeof defaultId !== "string") {
      return res.status(400).json({ error: "defaultId is required" });
    }
    if (isFutureDay(date)) {
      return res.status(400).json({ error: "Cannot restore default habits on a future day" });
    }
    const key = suppressionKey(date, defaultId);
    await suppressionsCollection.deleteOne({ userId: req.userId, key });
    const userTemplates = await getOrCreateDefaultTasksForUser(req.userId);
    const def = userTemplates.find((d) => d.id === defaultId);
    if (def) {
      await insertDefaultTodoIfMissing(req.userId, date, def);
    }
    await ensureDailyDefaultsForUser(req.userId, [date]);
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/todos/default-status", async (req, res) => {
  try {
    const date = req.query.date;
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }
    const status = await getDefaultMissingStatus(req.userId, date);
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/todos/apply-defaults-for-day", async (req, res) => {
  try {
    const { date } = req.body ?? {};
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: "date must be YYYY-MM-DD" });
    }
    if (isFutureDay(date)) {
      return res.status(400).json({ error: "Default habits can only be added for today or earlier" });
    }
    const inserted = await insertMissingDefaultTodosForUserDay(req.userId, date);
    await ensureDailyDefaultsForUser(req.userId, [date]);
    res.json({ inserted });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Streaks ending on `date` (default today). */
app.get("/api/stats/streaks", async (req, res) => {
  try {
    const endDate =
      req.query.date && typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : todayISO();
    const from = addDaysISO(endDate, -500);
    const all = await todosCollection
      .find(
        { userId: req.userId, date: { $gte: from, $lte: endDate } },
        { projection: { _id: 0, date: 1, completed: 1, defaultId: 1, tags: 1 } }
      )
      .toArray();
    const byDate = new Map();
    for (const t of all) {
      if (!byDate.has(t.date)) byDate.set(t.date, []);
      byDate.get(t.date).push(t);
    }

    function isCoreTask(t) {
      return Boolean(t.defaultId) || (Array.isArray(t.tags) && t.tags.includes("core"));
    }

    let streakAny = 0;
    let d = endDate;
    while (true) {
      const day = byDate.get(d) || [];
      const done = day.some((t) => t.completed);
      if (!done) break;
      streakAny += 1;
      d = addDaysISO(d, -1);
    }

    let streakFull = 0;
    d = endDate;
    while (true) {
      const day = byDate.get(d) || [];
      if (day.length === 0) break;
      if (!day.every((t) => t.completed)) break;
      streakFull += 1;
      d = addDaysISO(d, -1);
    }

    let streakCore = 0;
    d = endDate;
    while (true) {
      const day = byDate.get(d) || [];
      const core = day.filter(isCoreTask);
      if (core.length === 0) {
        d = addDaysISO(d, -1);
        continue;
      }
      if (!core.every((t) => t.completed)) break;
      streakCore += 1;
      d = addDaysISO(d, -1);
    }

    res.json({
      endDate,
      streakAnyCompleted: streakAny,
      streakFullDay: streakFull,
      streakCore: streakCore,
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/goals", async (req, res) => {
  try {
    const ref =
      req.query.date && typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : todayISO();
    const goals = await goalsCollection.find({ userId: req.userId }, { projection: { _id: 0 } }).toArray();
    const out = [];
    for (const g of goals) {
      let periodStart;
      let periodEnd;
      if (g.period === "month") {
        periodStart = startOfMonthUTC(ref);
        periodEnd = endOfMonthUTC(ref);
      } else {
        periodStart = startOfWeekMondayUTC(ref);
        periodEnd = endOfWeekSundayUTC(ref);
      }
      const matchTag = g.matchTag;
      const count = await todosCollection.countDocuments({
        userId: req.userId,
        completed: true,
        date: { $gte: periodStart, $lte: periodEnd },
        tags: matchTag,
      });
      out.push({
        ...g,
        periodStart,
        periodEnd,
        currentCount: count,
        progress: g.targetCount > 0 ? Math.min(1, count / g.targetCount) : 0,
      });
    }
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/goals", async (req, res) => {
  try {
    const { title, period, targetCount, matchTag } = req.body ?? {};
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    if (period !== "week" && period !== "month") {
      return res.status(400).json({ error: "period must be week or month" });
    }
    const target = Number.parseInt(String(targetCount), 10);
    if (!Number.isFinite(target) || target < 1 || target > 999) {
      return res.status(400).json({ error: "targetCount must be 1–999" });
    }
    if (!matchTag || typeof matchTag !== "string" || !/^[\w-]+$/.test(matchTag.trim())) {
      return res.status(400).json({ error: "matchTag must be a single tag (letters, numbers, hyphen)" });
    }
    const normalizedTag = matchTag.trim().toLowerCase();
    const now = new Date().toISOString();
    const goal = {
      id: randomUUID(),
      userId: req.userId,
      title: title.trim(),
      period,
      targetCount: target,
      matchTag: normalizedTag,
      createdAt: now,
      updatedAt: now,
    };
    await goalsCollection.insertOne(goal);
    res.status(201).json(goal);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/goals/:id", async (req, res) => {
  try {
    const { title, period, targetCount, matchTag } = req.body ?? {};
    const set = { updatedAt: new Date().toISOString() };
    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) return res.status(400).json({ error: "title invalid" });
      set.title = title.trim();
    }
    if (period !== undefined) {
      if (period !== "week" && period !== "month") return res.status(400).json({ error: "period invalid" });
      set.period = period;
    }
    if (targetCount !== undefined) {
      const target = Number.parseInt(String(targetCount), 10);
      if (!Number.isFinite(target) || target < 1 || target > 999) {
        return res.status(400).json({ error: "targetCount must be 1–999" });
      }
      set.targetCount = target;
    }
    if (matchTag !== undefined) {
      if (typeof matchTag !== "string" || !/^[\w-]+$/.test(matchTag.trim())) {
        return res.status(400).json({ error: "matchTag invalid" });
      }
      set.matchTag = matchTag.trim().toLowerCase();
    }
    const result = await goalsCollection.findOneAndUpdate(
      { userId: req.userId, id: req.params.id },
      { $set: set },
      { returnDocument: "after", projection: { _id: 0 } }
    );
    const doc = findOneAndUpdateDoc(result);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/goals/:id", async (req, res) => {
  try {
    const removed = await goalsCollection.deleteOne({ userId: req.userId, id: req.params.id });
    if (!removed.deletedCount) return res.status(404).json({ error: "Not found" });
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.get("/api/todos/:id", async (req, res) => {
  try {
    const todo = await todosCollection.findOne(
      { userId: req.userId, id: req.params.id },
      { projection: { _id: 0 } }
    );
    if (!todo) return res.status(404).json({ error: "Not found" });
    res.json(todo);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/todos", async (req, res) => {
  try {
    const { title, date, completed, tags, timeSlot, pinRank } = req.body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    const day = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayISO();
    const tagsN = normalizeTags(tags);
    let slot = null;
    if (timeSlot !== undefined && timeSlot !== null && timeSlot !== "") {
      if (!TIME_SLOTS.has(timeSlot)) {
        return res.status(400).json({ error: "timeSlot must be morning, afternoon, or evening" });
      }
      slot = timeSlot;
    }
    let pr = null;
    if (pinRank !== undefined && pinRank !== null && pinRank !== "") {
      const p = Number.parseInt(String(pinRank), 10);
      if (!Number.isFinite(p) || p < 1 || p > 3) {
        return res.status(400).json({ error: "pinRank must be 1–3" });
      }
      pr = p;
      if ((await countPinnedForDay(req.userId, day, null)) >= 3) {
        return res.status(400).json({ error: "At most 3 pinned tasks per day" });
      }
    }
    const now = new Date().toISOString();
    const todo = {
      id: randomUUID(),
      title: title.trim(),
      completed: Boolean(completed),
      date: day,
      userId: req.userId,
      tags: tagsN,
      timeSlot: slot,
      pinRank: pr,
      createdAt: now,
      updatedAt: now,
    };
    await todosCollection.insertOne(todo);
    res.status(201).json(todo);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/todos/bulk", async (req, res) => {
  try {
    const { items } = req.body ?? {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items[] is required" });
    }

    const now = new Date().toISOString();
    const docs = [];
    const pinAddsByDay = new Map();

    for (let i = 0; i < items.length; i++) {
      const it = items[i] ?? {};
      const title = typeof it.title === "string" ? it.title.trim() : "";
      if (!title) {
        return res.status(400).json({ error: `title is required at index ${i}` });
      }

      const date =
        typeof it.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.date) ? it.date : todayISO();

      const tagsN = normalizeTags(it.tags);
      let slot = null;
      if (it.timeSlot !== undefined && it.timeSlot !== null && it.timeSlot !== "") {
        if (!TIME_SLOTS.has(it.timeSlot)) {
          return res.status(400).json({ error: `timeSlot invalid at index ${i}` });
        }
        slot = it.timeSlot;
      }
      let pr = null;
      if (it.pinRank !== undefined && it.pinRank !== null && it.pinRank !== "") {
        const p = Number.parseInt(String(it.pinRank), 10);
        if (!Number.isFinite(p) || p < 1 || p > 3) {
          return res.status(400).json({ error: `pinRank must be 1–3 at index ${i}` });
        }
        pr = p;
        const prev = pinAddsByDay.get(date) ?? 0;
        const existingPins = await countPinnedForDay(req.userId, date, null);
        if (existingPins + prev + 1 > 3) {
          return res.status(400).json({ error: `Too many pins for ${date} (max 3 per day)` });
        }
        pinAddsByDay.set(date, prev + 1);
      }

      docs.push({
        id: randomUUID(),
        title,
        completed: Boolean(it.completed),
        date,
        userId: req.userId,
        tags: tagsN,
        timeSlot: slot,
        pinRank: pr,
        createdAt: now,
        updatedAt: now,
      });
    }

    await todosCollection.insertMany(docs, { ordered: false });
    res.status(201).json({ inserted: docs.length });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.put("/api/todos/:id", async (req, res) => {
  try {
    const { title, completed, date, tags, timeSlot, pinRank } = req.body;
    const existing = await todosCollection.findOne(
      { userId: req.userId, id: req.params.id },
      { projection: { _id: 0 } }
    );
    if (!existing) return res.status(404).json({ error: "Not found" });

    const set = {};
    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ error: "title must be non-empty" });
      }
      set.title = title.trim();
    }
    if (completed !== undefined) set.completed = Boolean(completed);
    if (date !== undefined) {
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "date must be YYYY-MM-DD" });
      }
      set.date = date;
    }
    if (tags !== undefined) set.tags = normalizeTags(tags);
    if (timeSlot !== undefined) {
      if (timeSlot === null || timeSlot === "") set.timeSlot = null;
      else if (TIME_SLOTS.has(timeSlot)) set.timeSlot = timeSlot;
      else return res.status(400).json({ error: "timeSlot must be morning, afternoon, or evening" });
    }
    if (pinRank !== undefined) {
      if (pinRank === null || pinRank === "") {
        set.pinRank = null;
      } else {
        const p = Number.parseInt(String(pinRank), 10);
        if (!Number.isFinite(p) || p < 1 || p > 3) {
          return res.status(400).json({ error: "pinRank must be 1–3" });
        }
        const targetDate = set.date ?? existing.date;
        if ((await countPinnedForDay(req.userId, targetDate, req.params.id)) >= 3) {
          return res.status(400).json({ error: "At most 3 pinned tasks per day" });
        }
        set.pinRank = p;
      }
    }

    set.updatedAt = new Date().toISOString();

    const result = await todosCollection.findOneAndUpdate(
      { userId: req.userId, id: req.params.id },
      { $set: set },
      { returnDocument: "after", projection: { _id: 0 } }
    );

    const doc = findOneAndUpdateDoc(result);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.patch("/api/todos/:id/toggle", async (req, res) => {
  try {
    const todo = await todosCollection.findOne(
      { userId: req.userId, id: req.params.id },
      { projection: { _id: 0 } }
    );
    if (!todo) return res.status(404).json({ error: "Not found" });
    const updated = await todosCollection.findOneAndUpdate(
      { userId: req.userId, id: req.params.id },
      { $set: { completed: !todo.completed, updatedAt: new Date().toISOString() } },
      { returnDocument: "after", projection: { _id: 0 } }
    );
    const doc = findOneAndUpdateDoc(updated);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.delete("/api/todos/:id", async (req, res) => {
  try {
    const todo = await todosCollection.findOne(
      { userId: req.userId, id: req.params.id },
      { projection: { _id: 0, date: 1, title: 1, defaultId: 1 } }
    );
    if (!todo) return res.status(404).json({ error: "Not found" });

    const userTemplates = await getOrCreateDefaultTasksForUser(req.userId);
    let defaultIdToSuppress = null;
    if (todo.defaultId && userTemplates.some((d) => d.id === todo.defaultId)) {
      defaultIdToSuppress = todo.defaultId;
    } else {
      const def = userTemplates.find((d) => normalizeTitle(d.title) === normalizeTitle(todo.title));
      if (def) defaultIdToSuppress = def.id;
    }

    await todosCollection.deleteOne({ userId: req.userId, id: req.params.id });

    if (defaultIdToSuppress && todo.date && /^\d{4}-\d{2}-\d{2}$/.test(todo.date)) {
      const key = suppressionKey(todo.date, defaultIdToSuppress);
      await suppressionsCollection.updateOne(
        { userId: req.userId, key },
        { $setOnInsert: { userId: req.userId, key } },
        { upsert: true }
      );
    }

    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** Progress report: per-day rate and counts for the last N calendar days ending today. Query: days=1–120 (default 30). */
app.get("/api/reports/progress-30d", async (req, res) => {
  try {
    let n = 30;
    const raw = req.query.days;
    if (raw !== undefined && raw !== "") {
      const parsed = parseInt(String(raw), 10);
      if (!Number.isNaN(parsed)) n = Math.min(120, Math.max(1, parsed));
    }
    const days = lastNDaysISO(n);
    // Merge duplicate default-template rows (same as GET /api/todos) so totals match the daily list.
    await ensureDailyDefaultsForUser(req.userId, days);
    const todos = await todosCollection
      .find({ userId: req.userId, date: { $in: days } }, { projection: { _id: 0, date: 1, completed: 1, defaultId: 1 } })
      .toArray();
    const byDate = new Map();
    for (const d of days) {
      byDate.set(d, { total: 0, completed: 0 });
    }
    for (const t of todos) {
      if (!byDate.has(t.date)) continue;
      if (isFutureDay(t.date) && t.defaultId) continue;
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
