/**
 * GET /api/migrate?secret=YOUR_CRON_SECRET
 * Idempotent schema repair route. Safe to run multiple times.
 * Fixes the reading_items unique index to include the `source` column.
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

    // Ensure reading_items table exists with all columns
    await db.run(sql`CREATE TABLE IF NOT EXISTS reading_items (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      course_canvas_id TEXT NOT NULL,
      course_name      TEXT NOT NULL,
      lecture_label    TEXT NOT NULL,
      reading_text     TEXT NOT NULL,
      detail           TEXT,
      completed_at     TEXT,
      source_page_url  TEXT,
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
      week_number      INTEGER,
      lecture_slot     TEXT NOT NULL DEFAULT 'unknown',
      source           TEXT NOT NULL DEFAULT 'ai',
      lecture_date     TEXT
    )`);
    results.push("✓ reading_items table ensured");

    // Add missing columns if they don't exist
    for (const [col, ddl] of [
      ["week_number",  "ALTER TABLE reading_items ADD COLUMN week_number INTEGER"],
      ["lecture_slot", "ALTER TABLE reading_items ADD COLUMN lecture_slot TEXT NOT NULL DEFAULT 'unknown'"],
      ["source",       "ALTER TABLE reading_items ADD COLUMN source TEXT NOT NULL DEFAULT 'ai'"],
      ["lecture_date", "ALTER TABLE reading_items ADD COLUMN lecture_date TEXT"],
    ] as [string, string][]) {
      try {
        const cols = await db.all(sql`SELECT name FROM pragma_table_info('reading_items')`);
        const colNames = (cols as { name: string }[]).map(c => c.name);
        if (!colNames.includes(col)) {
          await db.run(sql.raw(ddl));
          results.push(`✓ added column ${col}`);
        } else {
          results.push(`- column ${col} already exists`);
        }
      } catch (e) { results.push(`! ${col}: ${e}`); }
    }

    // Drop old unique index (without source) and recreate with source
    try {
      await db.run(sql`DROP INDEX IF EXISTS reading_items_unique_idx`);
      results.push("✓ dropped old unique index");
    } catch (e) { results.push(`! drop index: ${e}`); }

    try {
      await db.run(sql`CREATE UNIQUE INDEX IF NOT EXISTS reading_items_unique_idx
        ON reading_items (course_canvas_id, lecture_label, reading_text, source)`);
      results.push("✓ created new unique index with source column");
    } catch (e) { results.push(`! create index: ${e}`); }

    try {
      await db.run(sql`CREATE INDEX IF NOT EXISTS reading_items_course_idx
        ON reading_items (course_canvas_id)`);
      results.push("✓ course index ensured");
    } catch (e) { results.push(`! course index: ${e}`); }

    // ── Deadline provenance on tasks ───────────────────────────────────
    // `deadline_source` is what lets the Canvas sync tell a real Canvas due
    // date apart from one we derived from the timetable, so a 6-hourly sync
    // stops wiping derived deadlines. `linked_event_id` records which
    // calendar session a deadline came from.
    for (const [col, ddl] of [
      ["deadline_source", "ALTER TABLE tasks ADD COLUMN deadline_source TEXT"],
      ["linked_event_id", "ALTER TABLE tasks ADD COLUMN linked_event_id INTEGER"],
    ] as [string, string][]) {
      try {
        const cols = await db.all(sql`SELECT name FROM pragma_table_info('tasks')`);
        const colNames = (cols as { name: string }[]).map(c => c.name);
        if (!colNames.includes(col)) {
          await db.run(sql.raw(ddl));
          results.push(`✓ added tasks.${col}`);
        } else {
          results.push(`- tasks.${col} already exists`);
        }
      } catch (e) { results.push(`! tasks.${col}: ${e}`); }
    }

    // Backfill: every existing due date we didn't derive came from Canvas.
    try {
      await db.run(sql`UPDATE tasks SET deadline_source = 'canvas'
                       WHERE due_at IS NOT NULL AND deadline_source IS NULL`);
      results.push("✓ backfilled deadline_source='canvas' for existing due dates");
    } catch (e) { results.push(`! backfill deadline_source: ${e}`); }

    // ── Deadline alignment columns on reading_items ─────────────────────
    for (const [col, ddl] of [
      ["linked_timetable_event_id", "ALTER TABLE reading_items ADD COLUMN linked_timetable_event_id INTEGER"],
      ["deadline_confidence",       "ALTER TABLE reading_items ADD COLUMN deadline_confidence REAL"],
    ] as [string, string][]) {
      try {
        const cols = await db.all(sql`SELECT name FROM pragma_table_info('reading_items')`);
        const colNames = (cols as { name: string }[]).map(c => c.name);
        if (!colNames.includes(col)) {
          await db.run(sql.raw(ddl));
          results.push(`✓ added reading_items.${col}`);
        } else {
          results.push(`- reading_items.${col} already exists`);
        }
      } catch (e) { results.push(`! reading_items.${col}: ${e}`); }
    }

    // Report current state
    const tables = await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`);
    const indexes = await db.all(sql`SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='reading_items'`);
    const count = await db.all(sql`SELECT COUNT(*) as n FROM reading_items`);

    results.push(`Tables: ${(tables as {name:string}[]).map(t=>t.name).join(", ")}`);
    results.push(`reading_items indexes: ${(indexes as {name:string}[]).map(i=>i.name).join(", ")}`);
    results.push(`reading_items rows: ${(count as {n:number}[])[0]?.n ?? 0}`);

  } catch (err) {
    return NextResponse.json({ error: String(err), results }, { status: 500 });
  }

  return NextResponse.json({ ok: true, results });
}
