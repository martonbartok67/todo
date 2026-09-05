/**
 * Shared task query helpers and urgency classification.
 * Used by both the API route and Server Components.
 */
import { db } from "@/lib/db";
import { tasks, courses } from "@/drizzle/schema";
import { eq, isNull, isNotNull, asc, desc, lte, and, or, gt } from "drizzle-orm";
import type { Task, Course } from "@/drizzle/schema";

// ── Urgency ────────────────────────────────────────────────────────────────

export type UrgencyLevel = "critical" | "high" | "medium" | "low" | "none";

/**
 * Classify urgency based on how far in the future dueAt is.
 * Returns "none" for tasks with no due date.
 */
export function getUrgency(dueAt: string | null): UrgencyLevel {
  if (!dueAt) return "none";
  const msUntilDue = new Date(dueAt).getTime() - Date.now();
  if (msUntilDue < 0)                        return "critical"; // overdue
  if (msUntilDue < 24 * 60 * 60 * 1000)     return "critical"; // < 24h
  if (msUntilDue < 48 * 60 * 60 * 1000)     return "high";     // < 48h
  if (msUntilDue < 7  * 24 * 60 * 60 * 1000) return "medium";  // < 7d
  return "low";
}

export const URGENCY_ORDER: Record<UrgencyLevel, number> = {
  critical: 0,
  high:     1,
  medium:   2,
  low:      3,
  none:     4,
};

// ── Enriched task type ─────────────────────────────────────────────────────

export type EnrichedTask = Task & {
  urgency:     UrgencyLevel;
  courseName:  string;
  accentColor: string | null;
};

// ── Queries ────────────────────────────────────────────────────────────────

/** All incomplete, non-snoozed tasks sorted by urgency then due date. */
export async function getPendingTasks(): Promise<EnrichedTask[]> {
  const now = new Date().toISOString();

  const rows = await db
    .select({
      task:        tasks,
      courseName:  courses.name,
      accentColor: courses.accentColor,
    })
    .from(tasks)
    .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
    .where(
      and(
        isNull(tasks.completedAt),
        or(
          isNull(tasks.snoozedUntil),
          lte(tasks.snoozedUntil, now)   // snooze expired
        )
      )
    );

  const enriched: EnrichedTask[] = rows.map(({ task, courseName, accentColor }) => ({
    ...task,
    urgency:     getUrgency(task.dueAt),
    courseName:  courseName ?? "Unknown Course",
    accentColor: accentColor ?? null,
  }));

  // Sort: urgency ASC, then dueAt ASC (nulls last), then title ASC
  return enriched.sort((a, b) => {
    const uDiff = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (uDiff !== 0) return uDiff;
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return  1;
    return a.title.localeCompare(b.title);
  });
}

/** Tasks due within 48 hours (for notification bell). */
export async function getUpcomingDeadlines(): Promise<EnrichedTask[]> {
  const now        = new Date();
  const in48h      = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const nowIso     = now.toISOString();

  const rows = await db
    .select({
      task:        tasks,
      courseName:  courses.name,
      accentColor: courses.accentColor,
    })
    .from(tasks)
    .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
    .where(
      and(
        isNull(tasks.completedAt),
        isNotNull(tasks.dueAt),
        gt(tasks.dueAt, nowIso),      // not already overdue
        lte(tasks.dueAt, in48h)        // due within 48h
      )
    );

  return rows.map(({ task, courseName, accentColor }) => ({
    ...task,
    urgency:     getUrgency(task.dueAt),
    courseName:  courseName ?? "Unknown Course",
    accentColor: accentColor ?? null,
  }));
}

/** Completed tasks, most recent first, capped at 50. */
export async function getCompletedTasks(): Promise<EnrichedTask[]> {
  const rows = await db
    .select({
      task:        tasks,
      courseName:  courses.name,
      accentColor: courses.accentColor,
    })
    .from(tasks)
    .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
    .where(isNotNull(tasks.completedAt))
    .orderBy(desc(tasks.completedAt))
    .limit(50);

  return rows.map(({ task, courseName, accentColor }) => ({
    ...task,
    urgency:     getUrgency(task.dueAt),
    courseName:  courseName ?? "Unknown Course",
    accentColor: accentColor ?? null,
  }));
}

/** Last sync log entry for status display. */
export async function getLastSyncStatus() {
  const { syncLog } = await import("@/drizzle/schema");
  const rows = await db
    .select()
    .from(syncLog)
    .orderBy(desc(syncLog.startedAt))
    .limit(1);
  return rows[0] ?? null;
}
