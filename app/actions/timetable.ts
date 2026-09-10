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
import { eq, isNull, and, gte, lte, like, not, asc } from "drizzle-orm";
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
    .orderBy(asc(timetableEvents.startAt));

  if (!events.length) return null;

  // Math: skip Friday workshops, use earliest non-Friday event
  if (courseCanvasId === "57923") {
    const nonFriday = events.find((e) => new Date(e.startAt).getUTCDay() !== 5);
    return (nonFriday ?? events[0]).startAt;
  }

  return events[0].startAt;
}

// ── Main action ────────────────────────────────────────────────────────────

// ── Module → ISO week mapping (hardcoded from course manuals) ─────────────
// Key: courseCanvasId, value: map of module-number-regex → ISO week
const MODULE_WEEK_MAP: Record<string, Array<{ pattern: RegExp; week: number }>> = {
  // BT1201 Introduction to Business
  "57918": [
    { pattern: /module\s*1\b/i,  week: 36 },
    { pattern: /module\s*2\b/i,  week: 37 },
    { pattern: /module\s*3\b/i,  week: 38 },
    { pattern: /module\s*4\b/i,  week: 39 },
    { pattern: /module\s*5\b/i,  week: 40 },
    { pattern: /module\s*6\b/i,  week: 41 },
    { pattern: /module\s*7\b/i,  week: 44 },
    { pattern: /module\s*8\b/i,  week: 45 },
    { pattern: /module\s*9\b/i,  week: 46 },
    { pattern: /module\s*10\b/i, week: 47 },
    { pattern: /module\s*11\b/i, week: 48 },
    { pattern: /module\s*12\b/i, week: 49 },
    { pattern: /\bwk36\b/i,      week: 36 },
    { pattern: /\bwk37\b/i,      week: 37 },
    { pattern: /\bwk38\b/i,      week: 38 },
    { pattern: /\bwk39\b/i,      week: 39 },
    { pattern: /\bwk40\b/i,      week: 40 },
    { pattern: /\bwk41\b/i,      week: 41 },
    { pattern: /\bwk44\b/i,      week: 44 },
    { pattern: /\bwk45\b/i,      week: 45 },
    { pattern: /\bwk46\b/i,      week: 46 },
    { pattern: /\bwk47\b/i,      week: 47 },
    { pattern: /\bwk48\b/i,      week: 48 },
    { pattern: /\bwk49\b/i,      week: 49 },
  ],
  // BT1202 Organisational Behaviour
  "57916": [
    { pattern: /\blecture\s*1\b|week\s*36\b/i, week: 36 },
    { pattern: /\blecture\s*2\b|week\s*37\b/i, week: 37 },
    { pattern: /\blecture\s*3\b|week\s*38\b/i, week: 38 },
    { pattern: /\blecture\s*4\b|week\s*39\b/i, week: 39 },
    { pattern: /\blecture\s*5\b|week\s*40\b/i, week: 40 },
    { pattern: /\blecture\s*6\b|week\s*41\b/i, week: 41 },
    { pattern: /\bworkshop\b/i,                   week: 40 },
  ],
};

// Math: Unit X.Y → course week X → ISO week = 35 + X
// e.g. Unit 3.1 → week 3 → ISO 38. Week N title → ISO 35 + N.
// Handled separately in matchModuleWeek() below.

// Courses to skip deadline assignment (not real coursework)
const SKIP_COURSES = new Set(["43161", "56744", "56741", "42446"]);

function matchModuleWeek(courseCanvasId: string, text: string): number | null {
  // Math (BT1304): Unit/Week X.Y → ISO week 35 + X (no block gap, linear)
  if (courseCanvasId === "57923") {
    const dotMatch  = text.match(/\b(\d+)\.(\d+)/);
    if (dotMatch) return 35 + parseInt(dotMatch[1], 10);
    const unitMatch = text.match(/\bunit\s*(\d+)\b/i);
    if (unitMatch) return 35 + parseInt(unitMatch[1], 10);
    const weekMatch = text.match(/\bweek\s*(\d+)\b/i);
    if (weekMatch) return 35 + parseInt(weekMatch[1], 10);
    const wkMatch   = text.match(/\bwk(\d+)\b/i);
    if (wkMatch) return parseInt(wkMatch[1], 10);
    return null;
  }

  // IB (BT1201): Module X.Y or X — explicit mapping from course manual
  // Block 1: modules 1-6 → wk36-41. Gap: wk42-43 (exams+self study).
  // Block 2: modules 7-12 → wk44-49.
  if (courseCanvasId === "57918") {
    const IB_MODULE_WEEK: Record<number, number> = {
      1: 36, 2: 37, 3: 38, 4: 39, 5: 40, 6: 41,
      7: 44, 8: 45, 9: 46, 10: 47, 11: 48, 12: 49,
    };
    // Extract module number from "X.Y", "Module X", "X " patterns
    const dotMatch = text.match(/\b(\d+)\.(\d+)/);
    const modNum   = dotMatch
      ? parseInt(dotMatch[1], 10)
      : (() => {
          const m = text.match(/\bmodule\s*(\d+)\b/i) ?? text.match(/\b(\d+)\b/);
          return m ? parseInt(m[1], 10) : null;
        })();
    if (modNum !== null && IB_MODULE_WEEK[modNum]) return IB_MODULE_WEEK[modNum];
    // Fallback: wkXX already ISO
    const wkMatch = text.match(/\bwk(\d+)\b/i);
    if (wkMatch) return parseInt(wkMatch[1], 10);
    return null;
  }
  // First try generic week/wk regex
  const generic = extractWeekNumber(text);
  if (generic) return generic;
  // Then try course-specific module patterns
  const map = MODULE_WEEK_MAP[courseCanvasId];
  if (!map) return null;
  for (const { pattern, week } of map) {
    if (pattern.test(text)) return week;
  }
  return null;
}

export async function attachTimetableDeadlines(): Promise<{
  matched: number; skipped: number; noEvents: number;
}> {
  let matched = 0, skipped = 0, noEvents = 0;

  const undated = await db.select().from(tasks)
    .where(and(isNull(tasks.dueAt), isNull(tasks.completedAt)));

  for (const task of undated) {
    // Skip non-coursework courses
    if (SKIP_COURSES.has(task.courseCanvasId)) { skipped++; continue; }

    // Try to find a week number from title + description
    const searchText = [task.title, task.description ?? "", task.itemType ?? ""].join(" ");
    const weekNum = matchModuleWeek(task.courseCanvasId, searchText);

    if (!weekNum) { skipped++; continue; }

    const eventDate = await findEventForWeek(task.courseCanvasId, weekNum);
    if (!eventDate) { noEvents++; continue; }

    // Due 1 hour before lecture
    const due = new Date(eventDate);
    due.setHours(due.getHours() - 1);

    // Remedial Quiz gets +2 days after the lecture date
    if (/remedial\s*quiz/i.test(task.title)) {
      due.setDate(due.getDate() + 2);
    }

    await db.update(tasks)
      .set({ dueAt: due.toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(tasks.id, task.id));
    matched++;
  }

  // Attach lecture_date to reading_items with weekNumber but no lectureDate
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

export async function saveIcalUrl(url: string, label: string | null) {
  const trimmed = (url ?? "").trim().replace(/\s+/g, "");
  if (!trimmed) return { status: "error" as const, error: "URL is required" };
  const now = new Date().toISOString();
  await db.insert(userSettings)
    .values({ id: 1, icalUrl: trimmed, icalLabel: label || "My Timetable", createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: userSettings.id, set: { icalUrl: trimmed, icalLabel: label || "My Timetable", updatedAt: now } });
  revalidatePath("/timetable");
  revalidatePath("/settings");
  return { status: "ok" as const, synced: 0 };
}

export async function clearIcalUrl() {
  const now = new Date().toISOString();
  await db.update(userSettings)
    .set({ icalUrl: null, icalLabel: null, updatedAt: now })
    .where(eq(userSettings.id, 1));
  revalidatePath("/timetable");
  revalidatePath("/settings");
  return { ok: true };
}
