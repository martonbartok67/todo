"use server";
/**
 * Server actions for timetable-related operations.
 */
import { db } from "@/lib/db";
import { tasks, timetableEvents } from "@/drizzle/schema";
import { eq, and, isNull, gt, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * For every pending task with `due_at IS NULL`, look up the next upcoming
 * calendar event for the same course and set `due_at = event.start_at`.
 *
 * If the same course has no upcoming events, the task is left unchanged.
 * If multiple events exist, the soonest one wins.
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
    // Falls back to the soonest event for the course.
    const best = pickBestEvent(t.title, events);

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
 * Choose the best upcoming event for a given task. We score by how many
 * words the task title shares with the event title; ties go to the
 * sooner event.
 */
function pickBestEvent<T extends { title: string; startAt: string }>(
  taskTitle: string,
  events: T[],
): T {
  const taskWords = new Set(
    taskTitle.toLowerCase().split(/\W+/).filter((w) => w.length >= 3)
  );
  if (taskWords.size === 0) return events[0]!;

  let best = events[0]!;
  let bestScore = 0;
  for (const e of events) {
    const evWords = e.title.toLowerCase().split(/\W+/).filter((w) => w.length >= 3);
    const score = evWords.reduce((acc, w) => acc + (taskWords.has(w) ? 1 : 0), 0);
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}
