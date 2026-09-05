// scripts/init-db.mjs — apply schema directly to Turso (idempotent).
// Run with: node --env-file=.env scripts/init-db.mjs
//
// Bypasses @libsql/client's HttpClient because @libsql/client@0.6.x has a
// known bug: every execute()/batch() polls GET /v1/jobs for migration
// status, and Turso returns 400 for that endpoint until migrations are
// actually running — which trips the poller and throws. The runtime app
// works because drizzle-orm wraps queries in a way that survives the
// poller error, but for one-shot schema setup raw fetch is simpler.

const url       = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN in .env");
  process.exit(1);
}

// Turso HTTP API base: libsql://host  ->  https://host
const baseHttps = url.replace(/^libsql:\/\//, "https://");

const STATEMENTS = [
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

async function exec(sql) {
  // Turso v2/pipeline expects a Hrana-style pipeline. We send a single
  // STMT request and ignore the result body if it's not a SELECT.
  const body = {
    requests: [
      { type: "execute", stmt: { sql } },
      { type: "close" },
    ],
  };
  const res = await fetch(`${baseHttps}/v2/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} for SQL: ${sql.split("\n")[0]}\n${text}`);
  }
}

for (const sql of STATEMENTS) {
  await exec(sql);
}

// Verify
const verifyBody = {
  requests: [
    {
      type: "execute",
      stmt: {
        sql: "SELECT name FROM sqlite_master WHERE type IN ('table','index') AND name NOT LIKE 'sqlite_%' ORDER BY name",
      },
    },
    { type: "close" },
  ],
};
const verifyRes = await fetch(`${baseHttps}/v2/pipeline`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(verifyBody),
});
const verifyJson = await verifyRes.json();
const rows = verifyJson.results?.[0]?.response?.result?.rows ?? [];
console.log("Schema applied. Objects in DB:");
for (const row of rows) console.log("  - " + row[0].value);

