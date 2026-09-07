/**
 * GET /api/migrate?secret=YOUR_CRON_SECRET
 * One-time route to create missing tables in Turso.
 * Delete this file after running once.
 */
import { NextRequest, NextResponse } from "next/server";

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

    // Create reading_items table if not exists
    await db.run(`
      CREATE TABLE IF NOT EXISTS reading_items (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
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
    results.push("✓ reading_items table created (or already existed)");

    await db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS reading_items_unique_idx
      ON reading_items (course_canvas_id, lecture_label, reading_text)
    `);
    results.push("✓ reading_items_unique_idx created (or already existed)");

    await db.run(`
      CREATE INDEX IF NOT EXISTS reading_items_course_idx
      ON reading_items (course_canvas_id)
    `);
    results.push("✓ reading_items_course_idx created (or already existed)");

    // Verify all expected tables exist
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    results.push(`Tables: ${tables.map((t: any) => t.name).join(", ")}`);

  } catch (err) {
    return NextResponse.json({
      error: String(err), results,
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, results });
}
