/**
 * GET /api/migrate?secret=YOUR_CRON_SECRET
 * One-time route — creates missing Turso tables. Delete after use.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: string[] = [];

  try {
    const { db } = await import("@/lib/db");

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS reading_items (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        course_canvas_id TEXT NOT NULL,
        course_name      TEXT NOT NULL,
        lecture_label    TEXT NOT NULL,
        reading_text     TEXT NOT NULL,
        detail           TEXT,
        completed_at     TEXT,
        source_page_url  TEXT,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    results.push("✓ reading_items table ready");

    await db.run(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS reading_items_unique_idx
      ON reading_items (course_canvas_id, lecture_label, reading_text)
    `);
    results.push("✓ unique index ready");

    await db.run(sql`
      CREATE INDEX IF NOT EXISTS reading_items_course_idx
      ON reading_items (course_canvas_id)
    `);
    results.push("✓ course index ready");

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS timetable_events (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        canvas_id        TEXT NOT NULL,
        course_canvas_id TEXT,
        course_name      TEXT,
        title            TEXT NOT NULL,
        description      TEXT,
        location         TEXT,
        start_at         TEXT NOT NULL,
        end_at           TEXT,
        all_day          INTEGER NOT NULL DEFAULT 0,
        event_type       TEXT,
        source_url       TEXT,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    results.push("✓ timetable_events table ready");

    await db.run(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS timetable_events_canvas_id_idx
      ON timetable_events (canvas_id)
    `);
    await db.run(sql`
      CREATE INDEX IF NOT EXISTS timetable_events_start_at_idx
      ON timetable_events (start_at)
    `);
    await db.run(sql`
      CREATE INDEX IF NOT EXISTS timetable_events_course_idx
      ON timetable_events (course_canvas_id)
    `);
    results.push("✓ timetable_events indexes ready");

    // Add the new "source" column to existing timetable_events rows that
    // pre-date the iCal support. Safe no-op if the column already exists
    // because we use a CASE-based check via pragma.
    const cols = (await db.all(sql`PRAGMA table_info(timetable_events)`)) as Array<{ name: string }>;
    const hasSource = cols.some((c) => c.name === "source");
    if (!hasSource) {
      await db.run(sql`ALTER TABLE timetable_events ADD COLUMN source TEXT NOT NULL DEFAULT 'canvas'`);
      results.push("✓ timetable_events.source column added");
    }

    await db.run(sql`
      CREATE TABLE IF NOT EXISTS user_settings (
        id         INTEGER PRIMARY KEY,
        ical_url   TEXT,
        ical_label TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await db.run(sql`INSERT OR IGNORE INTO user_settings (id) VALUES (1)`);
    results.push("✓ user_settings table ready");

    const tables = await db.run(sql`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `);
    results.push("Tables in DB: " + JSON.stringify(tables));

  } catch (err) {
    return NextResponse.json({ error: String(err), results }, { status: 500 });
  }

  return NextResponse.json({ ok: true, results });
}
