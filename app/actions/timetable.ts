"use server";
/**
 * Server actions for timetable-related operations.
 */
import { db, dbReady } from "@/lib/db";
import { tasks, timetableEvents, userSettings, courses } from "@/drizzle/schema";
import { eq, and, isNull, gt, asc, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { runIcalSync } from "@/lib/canvas/sync";

/**
 * For every pending task with `due_at IS NULL`, look up the next upcoming
 * calendar event for the same course and set `due_at = event.start_at`.
 *
 * If the same course has no upcoming events, the task is left unchanged.
 * If multiple events exist, the one with the strongest title overlap wins,
 * with ties going to the soonest. Falls back to the soonest event for the
 * course when no event shares words with the task — this keeps coverage
 * high for courses where every event has an identical title.
 *
 * Returns counts of how many tasks were assigned vs. left untouched.
 */
export async function attachTimetableDeadlines(): Promise<{
  matched:  number;
  skipped:  number;
  noEvents: number;
}> {
  const now = new Date().toISOString();

  // Load all pending tasks without a due date.
  const undated = await db
    .select({ id: tasks.id, courseCanvasId: tasks.courseCanvasId, title: tasks.title })
    .from(tasks)
    .where(and(isNull(tasks.dueAt), isNull(tasks.completedAt)));

  if (undated.length === 0) {
    return { matched: 0, skipped: 0, noEvents: 0 };
  }

  // Load all upcoming events, ordered by course then time. We pull the
  // full list because it's small (one semester of events).
  const upcoming = await db
    .select({
      canvasId:       timetableEvents.canvasId,
      courseCanvasId: timetableEvents.courseCanvasId,
      courseName:     timetableEvents.courseName,
      title:          timetableEvents.title,
      startAt:        timetableEvents.startAt,
    })
    .from(timetableEvents)
    .where(gt(timetableEvents.startAt, now))
    .orderBy(asc(timetableEvents.startAt));

  // Per-course "subject signature": words from the course name + code.
  // Used by pickBestEvent to bias toward events that look like they
  // belong to the same subject as the task.
  const courseCodeByCourse = new Map<string, string | null>();
  const courseSigByCourse = new Map<string, Set<string>>();
  const allCourses = await db
    .select({ canvasId: courses.canvasId, courseCode: courses.courseCode, name: courses.name })
    .from(courses);
  for (const c of allCourses) {
    courseCodeByCourse.set(c.canvasId, c.courseCode);
    courseSigByCourse.set(
      c.canvasId,
      new Set(tokenize(`${c.courseCode ?? ""} ${c.name}`)),
    );
  }

  // Index upcoming events by course.
  const byCourse = new Map<string, typeof upcoming>();
  for (const e of upcoming) {
    if (!e.courseCanvasId) continue;
    const arr = byCourse.get(e.courseCanvasId) ?? [];
    arr.push(e);
    byCourse.set(e.courseCanvasId, arr);
  }

  let matched = 0;
  let noEvents = 0;
  // Undated tasks from courses with NO events at all — skip silently.
  for (const t of undated) {
    const events = byCourse.get(t.courseCanvasId);
    if (!events || events.length === 0) {
      noEvents++;
      continue;
    }

    // Prefer the event whose title most closely matches the task title.
    // Falls back to the soonest event for the course when no event
    // shares any words with the task (keeps the 330-attached coverage
    // high for courses whose every event has the same title).
    const best = pickBestEvent(t.title, events, {
      courseCode: courseCodeByCourse.get(t.courseCanvasId) ?? null,
      courseSignature: courseSigByCourse.get(t.courseCanvasId) ?? new Set(),
    });

    await db
      .update(tasks)
      .set({ dueAt: best.startAt, updatedAt: now })
      .where(eq(tasks.id, t.id));
    matched++;
  }

  revalidatePath("/");
  revalidatePath("/timetable");

  return { matched, skipped: undated.length - matched, noEvents };
}

/**
 * Tokenize a string into a Set of "significant" lowercased words.
 * Drops words shorter than 3 chars and pure digits (course codes are
 * stripped separately by the caller, but we also drop stray numeric
 * tokens like week-1 / session-2 to avoid false matches).
 */
function tokenize(s: string): Set<string> {
  const out = new Set<string>();
  for (const w of s.toLowerCase().split(/\W+/)) {
    if (w.length < 3) continue;
    if (/^\d+$/.test(w)) continue;
    out.add(w);
  }
  return out;
}

/**
 * Strip a leading "<CODE> - " prefix from an event title if present.
 * E.g. "BT1304 - Mathematics Tutorial" → "Mathematics Tutorial".
 * Used so the course code doesn't pollute the word-overlap scoring.
 */
function stripCourseCodePrefix(title: string, courseCode: string | null): string {
  if (!courseCode) return title;
  const prefix = courseCode.toLowerCase();
  const lower = title.toLowerCase();
  if (lower.startsWith(prefix)) {
    const rest = title.slice(courseCode.length).replace(/^[\s\-:]+/, "");
    return rest || title;
  }
  return title;
}

/**
 * Choose the best upcoming event for a given task. Scoring:
 *   1. +1 for every "significant" word the task title shares with the
 *      event title (case-folded, after stripping the course-code prefix).
 *   2. +1 (bonus) for every word the event title shares with the
 *      course's subject signature (course code + name). This biases
 *      toward events that look like they belong to the same subject
 *      as the task even when the task title doesn't repeat the words.
 * Ties go to the sooner event (events are pre-sorted by startAt ASC,
 * so the first event with the highest score wins).
 *
 * Falls back to the soonest event for the course when no event shares
 * any words with the task — this preserves coverage for courses whose
 * every event has the same title (e.g. "BT1304 - Mathematics" x20).
 */
function pickBestEvent<T extends { title: string; startAt: string }>(
  taskTitle: string,
  events: T[],
  opts: { courseCode: string | null; courseSignature: Set<string> },
): T {
  const taskWords = tokenize(taskTitle);
  if (taskWords.size === 0) return events[0]!;

  let best = events[0]!;
  let bestScore = 0;
  for (const e of events) {
    const evTitle = stripCourseCodePrefix(e.title, opts.courseCode);
    const evWords = tokenize(evTitle);

    let score = 0;
    evWords.forEach((w) => {
      if (taskWords.has(w)) score += 1;
      // Subject-signature bonus: prefer events that share words with
      // the course name itself (e.g. "Mathematics" appearing in the
      // event title when the course is "Mathematics").
      else if (opts.courseSignature.has(w)) score += 0.5;
    });
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Save the user's iCal feed URL. Triggers an immediate sync so the user
 * sees the events without waiting for the next cron tick.
 */
export async function saveIcalUrl(url: string, label: string | null): Promise<{
  status:  "saved" | "error";
  synced:  number;
  error?:  string;
}> {
  const trimmed = url.trim();
  if (!trimmed) {
    return { status: "error", synced: 0, error: "URL is empty" };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return { status: "error", synced: 0, error: "URL must start with http:// or https://" };
  }

  const now = new Date().toISOString();
  // Make sure the schema is fully bootstrapped (including the column-
  // level migrations for older DBs) before we touch any tables. Without
  // this the first action invocation after deploy can race the
  // background ensureSchema() and hit "no such column" errors.
  await dbReady();
  await db
    .insert(userSettings)
    .values({ id: 1, icalUrl: trimmed, icalLabel: label, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userSettings.id,
      set: { icalUrl: trimmed, icalLabel: label, updatedAt: now },
    });

  // Run the iCal sync in-process. The function reads the URL we just
  // saved, fetches the feed, parses it, and upserts events. We cap it
  // at 45s so the server action can't blow past Vercel's 60s limit.
  try {
    const r = await Promise.race([
      runIcalSync(),
      new Promise<{ eventsUpserted: number; error: string }>((resolve) =>
        setTimeout(() => resolve({ eventsUpserted: 0, error: "sync timed out after 45s" }), 45_000)
      ),
    ]);
    revalidatePath("/timetable");
    return { status: "saved", synced: r.eventsUpserted, error: r.error };
  } catch (err) {
    revalidatePath("/timetable");
    return { status: "saved", synced: 0, error: `sync threw: ${String(err)}` };
  }
}

/**
 * Clear the user's iCal URL (and remove any iCal-sourced events).
 */
export async function clearIcalUrl(): Promise<{ removed: number }> {
  const now = new Date().toISOString();
  await dbReady();
  await db
    .update(userSettings)
    .set({ icalUrl: null, icalLabel: null, updatedAt: now })
    .where(eq(userSettings.id, 1));
  // Drop all iCal events. Canvas events are unaffected.
  const r = await db
    .delete(timetableEvents)
    .where(eq(timetableEvents.source, "ical"))
    .returning({ id: timetableEvents.id });
  revalidatePath("/timetable");
  return { removed: r.length };
}

/**
 * Read the current iCal URL (or null if not configured). Used by the
 * /timetable page to pre-fill the form.
 */
export async function getIcalSettings(): Promise<{ url: string | null; label: string | null }> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1);
  return {
    url:   rows[0]?.icalUrl   ?? null,
    label: rows[0]?.icalLabel ?? null,
  };
}
