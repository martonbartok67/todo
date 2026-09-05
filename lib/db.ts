import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "@/drizzle/schema";

type DrizzleDB = LibSQLDatabase<typeof schema>;
let _db: DrizzleDB | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * Schema bootstrap statements — idempotent. Mirrors scripts/init-db.mjs
 * so the app can self-heal a fresh / wiped Turso DB without a separate
 * `npm run db:init` step.
 *
 * IMPORTANT: see `disableMigrationPoller()` for why we don't use
 * `@libsql/client.execute()` for any DB call.
 */
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS courses (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     canvas_id    TEXT NOT NULL,
     name         TEXT NOT NULL,
     course_code  TEXT,
     term         TEXT,
     accent_color TEXT,
     last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
     created_at   TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS courses_canvas_id_idx ON courses (canvas_id)`,

  `CREATE TABLE IF NOT EXISTS tasks (
     id               INTEGER PRIMARY KEY AUTOINCREMENT,
     course_canvas_id TEXT NOT NULL,
     canvas_id        TEXT NOT NULL,
     source_type      TEXT NOT NULL,
     title            TEXT NOT NULL,
     item_type        TEXT,
     due_at           TEXT,
     points_possible  REAL,
     url              TEXT,
     description      TEXT,
     completed_at     TEXT,
     snoozed_until    TEXT,
     last_synced_at   TEXT NOT NULL DEFAULT (datetime('now')),
     created_at       TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS tasks_canvas_source_idx ON tasks (canvas_id, source_type)`,
  `CREATE        INDEX IF NOT EXISTS tasks_course_idx    ON tasks (course_canvas_id)`,
  `CREATE        INDEX IF NOT EXISTS tasks_due_at_idx    ON tasks (due_at)`,
  `CREATE        INDEX IF NOT EXISTS tasks_completed_idx ON tasks (completed_at)`,

  `CREATE TABLE IF NOT EXISTS sync_log (
     id                INTEGER PRIMARY KEY AUTOINCREMENT,
     status            TEXT NOT NULL,
     tasks_upserted    INTEGER NOT NULL DEFAULT 0,
     courses_processed INTEGER NOT NULL DEFAULT 0,
     error_message     TEXT,
     duration_ms       INTEGER,
     started_at        TEXT NOT NULL DEFAULT (datetime('now')),
     finished_at       TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS push_subscriptions (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     endpoint   TEXT NOT NULL,
     p256dh_key TEXT NOT NULL,
     auth_key   TEXT NOT NULL,
     user_agent TEXT,
     created_at TEXT NOT NULL DEFAULT (datetime('now'))
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS push_endpoint_idx ON push_subscriptions (endpoint)`,
];

/**
 * Send one statement to Turso via the HTTP pipeline API (bypassing
 * @libsql/client's migration-job poller).
 */
async function executeRaw(baseHttps: string, authToken: string, sql: string): Promise<void> {
  const res = await fetch(`${baseHttps}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        { type: "execute", stmt: { sql } },
        { type: "close" },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Turso HTTP ${res.status} on bootstrap: ${sql.split("\n")[0]}\n${text}`);
  }
}

/**
 * Run idempotent CREATE TABLE / INDEX IF NOT EXISTS statements on first DB
 * use. Cached as a single promise so concurrent requests don't race.
 *
 * Skip when AUTO_INIT_SCHEMA=false (e.g. for migrations / CI tests).
 */
async function ensureSchema(): Promise<void> {
  if (process.env.AUTO_INIT_SCHEMA === "false") return;

  const url       = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return; // getDb() will throw a clearer error on use

  // libsql://host  →  https://host
  const baseHttps = url.replace(/^libsql:\/\//, "https://");

  for (const sql of SCHEMA_STATEMENTS) {
    await executeRaw(baseHttps, authToken, sql);
  }
}

/**
 * @libsql/client@0.6.x has a bug: every `execute()`/`batch()` call first
 * hits `GET /v1/jobs` to detect "schema database" status. If the response
 * is 200, or 400 with a non-`Invalid namespace` body, the client decides
 * the DB *is* a schema DB and then calls `waitForLastMigrationJobToFinish`,
 * which hits `GET /v1/jobs` again. Turso returns **400** for that endpoint
 * on databases where Drizzle's migrator was never run, and the call throws:
 *   "Unexpected status code while fetching migration jobs: 400"
 *
 * We never use Drizzle's migrator — schema is bootstrapped via raw fetch in
 * `ensureSchema()`. So the migration-job poller is pure overhead that
 * breaks every query.
 *
 * Workaround: monkey-patch the HttpClient instance so
 * `getIsSchemaDatabase()` always returns `false`, which short-circuits the
 * poller inside both `execute()` and `batch()`. We leave everything else
 * (Hrana streams, transactions, executeMultiple) untouched.
 *
 * The field is private (`#isSchemaDatabase`) but `getIsSchemaDatabase` is
 * a public method we can override. Tested against @libsql/client@0.6.2.
 */
function disableMigrationPoller(client: Client): void {
  const c = client as unknown as {
    getIsSchemaDatabase?: () => Promise<boolean>;
  };
  if (typeof c.getIsSchemaDatabase === "function") {
    c.getIsSchemaDatabase = async () => false;
  }
}

/**
 * Lazily create the Drizzle client. Throws a clear, readable error if env
 * vars are missing, instead of failing with an opaque "Invalid URL" deep
 * inside the libSQL client when `createClient` is called.
 */
export function getDb(): DrizzleDB {
  if (_db) return _db;

  const url       = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const missing = [
    !url       && "TURSO_DATABASE_URL",
    !authToken && "TURSO_AUTH_TOKEN",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    throw new Error(
      `Database unavailable: missing env var(s): ${missing.join(", ")}. ` +
      `Add them in Vercel → Settings → Environment Variables, then redeploy.`
    );
  }

  const client = createClient({ url: url!, authToken: authToken! });
  disableMigrationPoller(client);
  _db = drizzle(client, { schema });

  // Kick off schema bootstrap in the background. We don't `await` it here
  // because `getDb()` is called from many places that can't tolerate a slow
  // first call — but we *do* await it below via `dbReady()` for endpoints
  // that need the schema to exist (e.g. /api/sync).
  _initPromise ??= ensureSchema().catch((err) => {
    _initPromise = null; // allow retry on next request
    throw err;
  });

  return _db;
}

/**
 * Resolves once the DB client is connected AND the schema has been
 * bootstrapped (idempotent CREATE IF NOT EXISTS). Call this from any code
 * path that requires the tables to exist before issuing queries — most
 * importantly from `/api/sync` and `/api/push`, which would otherwise
 * race against the background init and hit "no such table".
 */
export async function dbReady(): Promise<DrizzleDB> {
  const db = getDb();
  if (_initPromise) {
    await _initPromise;
  }
  return db;
}

/**
 * Lazy proxy over the Drizzle client. Defers connection until first use
 * and binds each method so Drizzle's internal `this`-chaining works.
 */
export const db = new Proxy({} as DrizzleDB, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const val  = real[prop];
    return typeof val === "function" ? (val as Function).bind(real) : val;
  },
}) as DrizzleDB;
