"use server";
/**
 * Timetable server actions.
 * attachTimetableDeadlines() — matches undated tasks to their lecture date
 * using ISO week number extracted from task title / module label.
 *
 * Matching strategy (in priority order):
 *   1. reading_items with weekNumber → direct ISO week lookup in timetable_events
 *   2. tasks without due_at          → match course + ISO week from task title
 *   3. session-based courses (Marketing) → match by session order
 */
import { db } from "@/lib/db";
import { tasks, timetableEvents, userSettings, readingItems } from "@/drizzle/schema";
import { eq, isNull, and, gte, lte, like, not } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// ── ISO week helpers ───────────────────────────────────────────────────────

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Extract ISO week number from strings like "wk36", "Week 36", "Module 3 (wk38)", "(wk44)" */
function extractWeekNumber(text: string): number | null {
  const patterns = [
    /\bw(?:ee)?k[\s_-]?(\d{2})\b/i,   // wk36, week36, week 36
    /\(wk(\d{2})\)/i,                   // (wk36)
    /\bweek[\s_-]?(\d{1,2})\b/i,       // Week 3
    /\bmodule[\s\d\-]+\(wk(\d{2})\)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/** Find the timetable event for a given course + ISO week number */
async function findEventForWeek(
  courseCanvasId: string,
  weekNumber: number,
  year = 2026,
): Promise<string | null> {
  // Week start/end boundaries
  const jan4    = new Date(Date.UTC(year, 0, 4));
  const dow     = (jan4.getUTCDay() + 6) % 7;
  const week1Mon = new Date(jan4);
  week1Mon.setUTCDate(jan4.getUTCDate() - dow);
  const weekStart = new Date(week1Mon);
  weekStart.setUTCDate(week1Mon.getUTCDate() + (weekNumber - 1) * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

  const startIso = weekStart.toISOString();
  const endIso   = weekEnd.toISOString().replace("T00:00:00", "T23:59:59");

  // Find events for this course in this week
  const events = await db.select()
    .from(timetableEvents)
    .where(
      and(
        eq(timetableEvents.courseCanvasId, courseCanvasId),
        gte(timetableEvents.startAt, startIso),
        lte(timetableEvents.startAt, endIso),
      )
    )
    .limit(1);

  return events[0]?.startAt ?? null;
}

// ── Main action ────────────────────────────────────────────────────────────

export async function attachTimetableDeadlines(): Promise<{
  matched: number; skipped: number; noEvents: number;
}> {
  let matched = 0, skipped = 0, noEvents = 0;

  // Get all tasks without due_at that are not completed
  const undated = await db.select().from(tasks)
    .where(and(isNull(tasks.dueAt), isNull(tasks.completedAt)));

  for (const task of undated) {
    // Try to extract week number from title or description
    const weekNum =
      extractWeekNumber(task.title) ??
      extractWeekNumber(task.description ?? "") ??
      extractWeekNumber(task.itemType ?? "");

    if (!weekNum) {
      skipped++;
      continue;
    }

    const eventDate = await findEventForWeek(task.courseCanvasId, weekNum);
    if (!eventDate) {
      noEvents++;
      continue;
    }

    // Set due_at to 1 hour before lecture start (read before class)
    const lectureTime = new Date(eventDate);
    lectureTime.setHours(lectureTime.getHours() - 1);

    await db.update(tasks)
      .set({ dueAt: lectureTime.toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, task.id));

    matched++;
  }

  // Also attach lecture_date to reading_items that have weekNumber but no lectureDate
  const undatedReadings = await db.select().from(readingItems)
    .where(and(isNull(readingItems.lectureDate), not(isNull(readingItems.weekNumber))));

  for (const r of undatedReadings) {
    if (!r.weekNumber) continue;
    const eventDate = await findEventForWeek(r.courseCanvasId, r.weekNumber);
    if (!eventDate) continue;
    await db.update(readingItems)
      .set({ lectureDate: eventDate, updatedAt: new Date().toISOString() })
      .where(eq(readingItems.id, r.id));
  }

  revalidatePath("/");
  revalidatePath("/readings");
  return { matched, skipped, noEvents };
}

// ── iCal settings ─────────────────────────────────────────────────────────

export async function saveIcalUrl(formData: FormData) {
  const url   = String(formData.get("icalUrl") ?? "").trim();
  const label = String(formData.get("icalLabel") ?? "").trim();
  const trimmed = url.replace(/\s+/g, "");
  if (!trimmed) return { error: "URL is required" };
  const now = new Date().toISOString();
  await db.insert(userSettings)
    .values({ id: 1, icalUrl: trimmed, icalLabel: label || "My Timetable", createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: userSettings.id, set: { icalUrl: trimmed, icalLabel: label || "My Timetable", updatedAt: now } });
  revalidatePath("/timetable");
  revalidatePath("/settings");
  return { ok: true };
}
