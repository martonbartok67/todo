import { db } from "@/lib/db";
import { tasks, courses, syncLog } from "@/drizzle/schema";
import { eq, isNull, isNotNull, desc, lte, and, or, gt } from "drizzle-orm";
import type { Task } from "@/drizzle/schema";

export type UrgencyLevel = "critical" | "high" | "medium" | "low" | "none";

export function getUrgency(dueAt: string | null): UrgencyLevel {
  if (!dueAt) return "none";
  const ms = new Date(dueAt).getTime() - Date.now();
  if (ms < 0)                          return "critical";
  if (ms < 24 * 60 * 60 * 1000)       return "critical";
  if (ms < 48 * 60 * 60 * 1000)       return "high";
  if (ms < 7  * 24 * 60 * 60 * 1000)  return "medium";
  return "low";
}

export const URGENCY_ORDER: Record<UrgencyLevel, number> = {
  critical: 0, high: 1, medium: 2, low: 3, none: 4,
};

export type EnrichedTask = Task & {
  urgency:     UrgencyLevel;
  courseName:  string;
  accentColor: string | null;
};

export type CourseGroup = {
  courseCanvasId: string;
  courseName:     string;
  accentColor:    string | null;
  tasks:          EnrichedTask[];
  topUrgency:     UrgencyLevel;  // urgency of the most urgent task in the group
};

// ── shared row fetch ──────────────────────────────────────────────────────

async function fetchPendingRows() {
  const now = new Date().toISOString();
  return db
    .select({ task: tasks, courseName: courses.name, accentColor: courses.accentColor })
    .from(tasks)
    .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
    .where(
      and(
        isNull(tasks.completedAt),
        or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, now))
      )
    );
}

function enrich(rows: Awaited<ReturnType<typeof fetchPendingRows>>): EnrichedTask[] {
  return rows
    .map(({ task, courseName, accentColor }) => ({
      ...task,
      urgency:     getUrgency(task.dueAt),
      courseName:  courseName ?? "Unknown Course",
      accentColor: accentColor ?? null,
    }))
    .sort((a, b) => {
      const u = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
      if (u !== 0) return u;
      if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
      if (a.dueAt) return -1;
      if (b.dueAt) return 1;
      return a.title.localeCompare(b.title);
    });
}

/** Flat list sorted by urgency then due date. */
export async function getPendingTasks(): Promise<EnrichedTask[]> {
  return enrich(await fetchPendingRows());
}

/**
 * Tasks grouped by course.
 * Within each group: urgency ASC, dueAt ASC, title ASC.
 * Groups sorted by their most urgent task ASC, then course name ASC.
 */
export async function getPendingTasksByCourse(): Promise<CourseGroup[]> {
  const enriched = enrich(await fetchPendingRows());

  const map = new Map<string, CourseGroup>();
  for (const task of enriched) {
    const key = task.courseCanvasId;
    if (!map.has(key)) {
      map.set(key, {
        courseCanvasId: key,
        courseName:     task.courseName,
        accentColor:    task.accentColor,
        tasks:          [],
        topUrgency:     task.urgency,
      });
    }
    map.get(key)!.tasks.push(task);
  }

  return Array.from(map.values()).sort((a, b) => {
    const u = URGENCY_ORDER[a.topUrgency] - URGENCY_ORDER[b.topUrgency];
    if (u !== 0) return u;
    return a.courseName.localeCompare(b.courseName);
  });
}

/** Tasks due within 48h (notification bell). */
export async function getUpcomingDeadlines(): Promise<EnrichedTask[]> {
  const now   = new Date().toISOString();
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const rows  = await db
    .select({ task: tasks, courseName: courses.name, accentColor: courses.accentColor })
    .from(tasks)
    .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
    .where(and(isNull(tasks.completedAt), isNotNull(tasks.dueAt), gt(tasks.dueAt, now), lte(tasks.dueAt, in48h)));
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
    .select({ task: tasks, courseName: courses.name, accentColor: courses.accentColor })
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

export async function getLastSyncStatus() {
  const rows = await db.select().from(syncLog).orderBy(desc(syncLog.startedAt)).limit(1);
  return rows[0] ?? null;
}
