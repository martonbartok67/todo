/**
 * Turso / libSQL client with self-healing schema bootstrap.
 *
 * Bootstrap strategy (fast path first):
 *   1. Check if all required tables exist in ONE query.
 *   2. If yes → skip all DDL, return immediately.
 *   3. If no  → run CREATE TABLE IF NOT EXISTS for missing tables only.
 *   4. Run column migrations PER TABLE (one PRAGMA per table, not per column).
 *
 * This cuts cold-start overhead from ~16 sequential HTTP calls to 1-2.
 */

// Patch global fetch to suppress @libsql/client's migration-job poller
// (GET /v1/jobs → 400 from Turso → client throws). Return 404 instead
// so the client treats it as "no migration in flight".
(function patchGlobalFetch() {
  const FLAG = "__pollerBypassInstalled";
  const g = globalThis as typeof globalThis & { [FLAG]?: boolean };
  if (g[FLAG]) return;
  const original = globalThis.fetch.bind(globalThis) as typeof fetch;
  globalThis.fetch = ((input, init) => {
    let urlStr = "";
    try {
      if (typeof input === "string") urlStr = input;
      else if (input instanceof URL) urlStr = input.href;
      else if (input && typeof input === "object" && "url" in input) urlStr = String((input as Request).url ?? "");
    } catch {}
    if (urlStr && (urlStr.includes("/v1/jobs") || urlStr.includes("/v2/jobs"))) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    return original(input, init);
  }) as typeof fetch;
  g[FLAG] = true;
})();

import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/drizzle/schema";

type DrizzleDB = LibSQLDatabase<typeof schema>;
let _db: DrizzleDB | null = null;
let _initPromise: Promise<void> | null = null;

// Tables that must exist for the app to function
const REQUIRED_TABLES = [
  "courses", "tasks", "sync_log", "push_subscriptions",
  "timetable_events", "user_settings", "reading_items",
];

// DDL run only when a table is missing
const TABLE_DDL: Record<string, string[]> = {
  courses: [`CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canvas_id TEXT NOT NULL, name TEXT NOT NULL, course_code TEXT, term TEXT,
    accent_color TEXT,
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS courses_canvas_id_idx ON courses (canvas_id)`],

  tasks: [`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_canvas_id TEXT NOT NULL, canvas_id TEXT NOT NULL,
    source_type TEXT NOT NULL, title TEXT NOT NULL, item_type TEXT,
    due_at TEXT, points_possible REAL, url TEXT, description TEXT,
    completed_at TEXT, snoozed_until TEXT,
    last_synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    classification TEXT NOT NULL DEFAULT 'unclassified',
    classification_reason TEXT, classified_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tasks_canvas_source_idx ON tasks (canvas_id, source_type)`,
  `CREATE INDEX IF NOT EXISTS tasks_course_idx         ON tasks (course_canvas_id)`,
  `CREATE INDEX IF NOT EXISTS tasks_due_at_idx         ON tasks (due_at)`,
  `CREATE INDEX IF NOT EXISTS tasks_completed_idx      ON tasks (completed_at)`,
  `CREATE INDEX IF NOT EXISTS tasks_classification_idx ON tasks (classification)`],

  sync_log: [`CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL, tasks_upserted INTEGER NOT NULL DEFAULT 0,
    courses_processed INTEGER NOT NULL DEFAULT 0, error_message TEXT,
    duration_ms INTEGER,
    started_at  TEXT NOT NULL DEFAULT (datetime('now')), finished_at TEXT
  )`],

  push_subscriptions: [`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint TEXT NOT NULL, p256dh_key TEXT NOT NULL, auth_key TEXT NOT NULL,
    user_agent TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS push_endpoint_idx ON push_subscriptions (endpoint)`],

  timetable_events: [`CREATE TABLE IF NOT EXISTS timetable_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canvas_id TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'canvas',
    course_canvas_id TEXT, course_name TEXT, title TEXT NOT NULL,
    description TEXT, location TEXT,
    start_at TEXT NOT NULL, end_at TEXT,
    all_day INTEGER NOT NULL DEFAULT 0, event_type TEXT, source_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS timetable_events_canvas_id_idx ON timetable_events (canvas_id)`,
  `CREATE INDEX IF NOT EXISTS timetable_events_start_at_idx ON timetable_events (start_at)`,
  `CREATE INDEX IF NOT EXISTS timetable_events_course_idx   ON timetable_events (course_canvas_id)`],

  user_settings: [`CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY, ical_url TEXT, ical_label TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `INSERT OR IGNORE INTO user_settings (id, ical_url, ical_label) VALUES (1, NULL, NULL)`],

  reading_items: [`CREATE TABLE IF NOT EXISTS reading_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_canvas_id TEXT NOT NULL, course_name TEXT NOT NULL,
    lecture_label TEXT NOT NULL, reading_text TEXT NOT NULL,
    detail TEXT, completed_at TEXT, source_page_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    week_number INTEGER,
    lecture_slot TEXT NOT NULL DEFAULT 'unknown',
    source TEXT NOT NULL DEFAULT 'ai',
    lecture_date TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS reading_items_course_idx ON reading_items (course_canvas_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS reading_items_unique_idx ON reading_items (course_canvas_id, lecture_label, reading_text, source)`],
};

// Column migrations — run ONE PRAGMA per table (not per column)
// to batch-check which columns are missing.
const COLUMN_MIGRATIONS: Record<string, Array<{ column: string; ddl: string }>> = {
  tasks: [
    { column: "classification",        ddl: "ALTER TABLE tasks ADD COLUMN classification TEXT NOT NULL DEFAULT 'unclassified'" },
    { column: "classification_reason", ddl: "ALTER TABLE tasks ADD COLUMN classification_reason TEXT" },
    { column: "classified_at",         ddl: "ALTER TABLE tasks ADD COLUMN classified_at TEXT" },
  ],
  timetable_events: [
    { column: "source", ddl: "ALTER TABLE timetable_events ADD COLUMN source TEXT NOT NULL DEFAULT 'canvas'" },
  ],
  reading_items: [
    { column: "week_number",  ddl: "ALTER TABLE reading_items ADD COLUMN week_number INTEGER" },
    { column: "lecture_slot", ddl: "ALTER TABLE reading_items ADD COLUMN lecture_slot TEXT NOT NULL DEFAULT 'unknown'" },
    { column: "source",       ddl: "ALTER TABLE reading_items ADD COLUMN source TEXT NOT NULL DEFAULT 'ai'" },
    { column: "lecture_date", ddl: "ALTER TABLE reading_items ADD COLUMN lecture_date TEXT" },
  ],
};

async function httpQuery(baseHttps: string, authToken: string, sql: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${baseHttps}/v2/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql } }, { type: "close" }] }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Turso HTTP ${res.status}: ${sql.slice(0, 60)}\n${text}`);
  }
  const body = await res.json().catch(() => null) as {
    results?: Array<{ response?: { result?: { rows?: Array<Record<string, unknown>> } } }>;
  } | null;
  return body?.results?.[0]?.response?.result?.rows ?? [];
}

async function httpExec(baseHttps: string, authToken: string, sql: string): Promise<void> {
  await httpQuery(baseHttps, authToken, sql);
}

async function ensureSchema(): Promise<void> {
  if (process.env.AUTO_INIT_SCHEMA === "false") return;
  const url       = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return;

  const baseHttps = url.replace(/^libsql:\/\//, "https://");

  // 1. Fast path: check all required tables in ONE query
  const rows = await httpQuery(baseHttps, authToken,
    `SELECT name FROM sqlite_master WHERE type='table'`
  );
  const existing = new Set(rows.map((r) => String(r.name ?? "")));
  const missing  = REQUIRED_TABLES.filter((t) => !existing.has(t));

  // 2. Create missing tables (usually none after first deploy)
  for (const table of missing) {
    for (const ddl of TABLE_DDL[table] ?? []) {
      await httpExec(baseHttps, authToken, ddl);
    }
  }

  // 3. Column migrations — one PRAGMA per TABLE (not per column)
  for (const [table, migrations] of Object.entries(COLUMN_MIGRATIONS)) {
    if (!existing.has(table) && !missing.includes(table)) continue; // table doesn't exist, skip
    const colRows = await httpQuery(baseHttps, authToken,
      `SELECT name FROM pragma_table_info('${table}')`
    );
    const cols = new Set(colRows.map((r) => String(r.name ?? "")));
    for (const m of migrations) {
      if (!cols.has(m.column)) {
        await httpExec(baseHttps, authToken, m.ddl);
      }
    }
  }
}

export function getDb(): DrizzleDB {
  if (_db) return _db;
  const url       = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const missing   = [!url && "TURSO_DATABASE_URL", !authToken && "TURSO_AUTH_TOKEN"].filter(Boolean) as string[];
  if (missing.length > 0) throw new Error(`Missing env vars: ${missing.join(", ")}`);
  const client = createClient({ url: url!, authToken: authToken! });
  _db = drizzle(client, { schema });
  _initPromise ??= ensureSchema().catch((err) => { _initPromise = null; throw err; });
  return _db;
}

export async function dbReady(): Promise<DrizzleDB> {
  const database = getDb();
  if (_initPromise) await _initPromise;
  return database;
}

export const db = new Proxy({} as DrizzleDB, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const val  = real[prop];
    return typeof val === "function" ? (val as Function).bind(real) : val;
  },
}) as DrizzleDB;
