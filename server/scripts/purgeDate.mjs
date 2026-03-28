/**
 * One-time / maintenance: delete all todos and default-habit suppressions for a calendar day.
 * Usage: node scripts/purgeDate.mjs [YYYY-MM-DD]
 * Default date: 2026-03-22 (Sunday)
 */
import { config } from "dotenv";
import { MongoClient } from "mongodb";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || "daily_todo";

const DATE =
  process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : "2026-03-22";

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI. Set it in server/.env");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);
  const todos = db.collection("todos");
  const suppressions = db.collection("defaultSuppressions");

  const todoRes = await todos.deleteMany({ date: DATE });
  const supRes = await suppressions.deleteMany({ key: new RegExp(`^${DATE}:`) });

  console.log(`Purged date ${DATE}:`);
  console.log(`  todos deleted:         ${todoRes.deletedCount}`);
  console.log(`  suppressions deleted: ${supRes.deletedCount}`);

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
