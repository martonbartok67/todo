import { db, dbReady } from "@/lib/db";
import { tasks, courses, syncLog } from "@/drizzle/schema";
import { eq, isNull, isNotNull, desc, lte, and, or, gt, ne, notInArray } from "drizzle-orm";
import type { Task } from "@/drizzle/schema";


// Courses excluded from all views — not real coursework
const SKIP_COURSES = ["43161", "56744", "56741", "42446"];

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

// ── Resilient column selection ──────────────────────────────────────────
//
// Production hit something dbReady() cannot fix: a query selecting the
// full `tasks` row (via the `task: tasks` shorthand, which is SELECT *)
// threw "no such column: tasks.deadline_source" — while /api/migrate's
// own `pragma_table_info('tasks')` check, run moments earlier on the same
// database, listed that exact column as present. Two reads of the same
// schema disagreeing isn't something waiting or re-running our own
// migration can fix; it points at inconsistent state on Turso's end that
// application code has no visibility into or control over.
//
// So the query itself has to tolerate it: try the full row first: on this
// specific error, and only this one, retry with every column except the
// two that were added most recently (deadlineSource, linkedEventId),
// filling them back in as null. The page renders with real data either
// way; the only cost on the fallback path is the timetable-derived-badge
// and its linked event going temporarily unknown for whichever rows hit
// it, which corrects itself the moment that column becomes readable
// again — nothing is lost, since the columns' actual stored values are
// untouched.
export const TASK_COLUMNS_SAFE = {
  id:                   tasks.id,
  courseCanvasId:       tasks.courseCanvasId,
  canvasId:             tasks.canvasId,
  sourceType:           tasks.sourceType,
  title:                tasks.title,
  itemType:             tasks.itemType,
  dueAt:                tasks.dueAt,
  pointsPossible:       tasks.pointsPossible,
  url:                  tasks.url,
  description:          tasks.description,
  completedAt:          tasks.completedAt,
  snoozedUntil:         tasks.snoozedUntil,
  lastSyncedAt:         tasks.lastSyncedAt,
  createdAt:            tasks.createdAt,
  updatedAt:            tasks.updatedAt,
  classification:       tasks.classification,
  classificationReason: tasks.classificationReason,
  classifiedAt:         tasks.classifiedAt,
};

export function isMissingColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /no such column/i.test(msg);
}

type SafeTaskRow = { [K in keyof typeof TASK_COLUMNS_SAFE]: Task[K] };
type TaskJoinRow = { task: Task; courseName: string | null; accentColor: string | null };
type SafeJoinRow = { task: SafeTaskRow; courseName: string | null; accentColor: string | null };

/**
 * Runs `full` (a SELECT * on `tasks`); on "no such column" only, retries
 * with `safe` (the same query built against TASK_COLUMNS_SAFE) and patches
 * the two dropped columns back in as null so callers see a normal `Task`
 * either way. Any other error still throws.
 */
export async function withTaskColumnFallback(
  full: () => Promise<TaskJoinRow[]>,
  safe: () => Promise<SafeJoinRow[]>,
): Promise<TaskJoinRow[]> {
  try {
    return await full();
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    console.error("tasks query: deadline_source/linked_event_id unreadable on this connection, falling back to safe columns:", e);
    const rows = await safe();
    return rows.map((r) => ({
      ...r,
      task: { ...r.task, deadlineSource: null, linkedEventId: null, notifiedAt: null },
    }));
  }
}

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
  await dbReady();
  const now = new Date().toISOString();
  const where = and(
    isNull(tasks.completedAt),
    or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, now)),
    // Step 2: hide "info" rows from the actionable task list. They
    // live in the Resources tab instead. "unclassified" rows still
    // appear — we don't want the list to be empty just because the
    // AI hasn't run yet.
    ne(tasks.classification, "info"),
  );
  return withTaskColumnFallback(
    () => db
      .select({ task: tasks, courseName: courses.name, accentColor: courses.accentColor })
      .from(tasks)
      .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
      .where(where),
    () => db
      .select({ task: TASK_COLUMNS_SAFE, courseName: courses.name, accentColor: courses.accentColor })
      .from(tasks)
      .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
      .where(where),
  );
}

function enrich(rows: Awaited<ReturnType<typeof fetchPendingRows>>): EnrichedTask[] {
  return rows
    .filter(({ task }) => !isNonTask(task.title, task.itemType))
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


// ── Non-task filter ───────────────────────────────────────────────────────
// Items that look like reading/reference material, not actionable tasks.
// Links are KEPT (they are usually task pages). Only remove slidedecks,
// PDFs, text-entry submissions, and remedial quiz (offset +2 days handled
// in deadline attachment).
function isNonTask(title: string, itemType: string | null): boolean {
  const t = title.toLowerCase();
  const type = (itemType ?? "").toLowerCase();
  // Slide decks and PDFs
  if (/slide\s*deck|slides?\.pdf|slidedeck/i.test(title)) return true;
  if (/\bclips?\s+slide/i.test(title)) return true;
  // Text entry = submission type, not a task to read
  if (type === "online_text_entry") return true;
  // Raw PDF files that are clearly reference material
  if (type === "file" && /\.pdf$/i.test(title) && !/quiz|exam|assignment|exercise/i.test(title)) return true;
  return false;
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
  await dbReady(); // see withTaskColumnFallback() — same full-row `tasks` select
  const now   = new Date().toISOString();
  const in48h = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const where = and(
    isNull(tasks.completedAt),
    isNotNull(tasks.dueAt),
    gt(tasks.dueAt, now),
    lte(tasks.dueAt, in48h),
    ne(tasks.classification, "info"),
  );
  const rows = await withTaskColumnFallback(
    () => db
      .select({ task: tasks, courseName: courses.name, accentColor: courses.accentColor })
      .from(tasks)
      .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
      .where(where),
    () => db
      .select({ task: TASK_COLUMNS_SAFE, courseName: courses.name, accentColor: courses.accentColor })
      .from(tasks)
      .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
      .where(where),
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
  await dbReady(); // see withTaskColumnFallback() — same full-row `tasks` select
  const where = and(isNotNull(tasks.completedAt), notInArray(tasks.courseCanvasId, SKIP_COURSES));
  const rows = await withTaskColumnFallback(
    () => db
      .select({ task: tasks, courseName: courses.name, accentColor: courses.accentColor })
      .from(tasks)
      .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
      .where(where)
      .orderBy(desc(tasks.completedAt))
      .limit(50),
    () => db
      .select({ task: TASK_COLUMNS_SAFE, courseName: courses.name, accentColor: courses.accentColor })
      .from(tasks)
      .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
      .where(where)
      .orderBy(desc(tasks.completedAt))
      .limit(50),
  );
  return rows.map(({ task, courseName, accentColor }) => ({
    ...task,
    urgency:     getUrgency(task.dueAt),
    courseName:  courseName ?? "Unknown Course",
    accentColor: accentColor ?? null,
  }));
}

// ── Step 2: Resources (info-classified tasks) ───────────────────────────

/**
 * Resource = a Canvas item the AI classified as informational, not
 * actionable. Same underlying row as a task — just shown in a different
 * tab. We still compute `urgency` so the resources UI can sort by
 * "recently added" or by due-date-when-relevant.
 */
export type EnrichedResource = Task & {
  courseName:        string;
  accentColor:       string | null;
  classificationReason: string | null;
};

/**
 * All resources across all courses, grouped by course.
 * Sorted: most recently classified first within each course.
 */
export async function getInfoResources(): Promise<EnrichedResource[]> {
  await dbReady(); // see withTaskColumnFallback() — same full-row `tasks` select
  const where = and(
    isNull(tasks.completedAt),
    or(
      eq(tasks.classification, "info"),
      isNull(tasks.dueAt)             // undated → treat as resource/reading material
    )
  );
  const rows = await withTaskColumnFallback(
    () => db
      .select({ task: tasks, courseName: courses.name, accentColor: courses.accentColor })
      .from(tasks)
      .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
      .where(where)
      .orderBy(desc(tasks.classifiedAt)),
    () => db
      .select({ task: TASK_COLUMNS_SAFE, courseName: courses.name, accentColor: courses.accentColor })
      .from(tasks)
      .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
      .where(where)
      .orderBy(desc(tasks.classifiedAt)),
  );
  return rows.map(({ task, courseName, accentColor }) => ({
    ...task,
    courseName:           courseName ?? "Unknown Course",
    accentColor:          accentColor ?? null,
    classificationReason: task.classificationReason,
  }));
}

export async function getLastSyncStatus() {
  const rows = await db.select().from(syncLog).orderBy(desc(syncLog.startedAt)).limit(1);
  return rows[0] ?? null;
}
