import { db } from "@/lib/db";
import { courses, tasks, syncLog, readingItems } from "@/drizzle/schema";
import { fetchAllPages } from "./client";
import { assignmentToTask, moduleItemToTask, type CanvasAssignment, type CanvasModuleItem } from "./transform";
import { extractReadings } from "./extract";
import { sql } from "drizzle-orm";

type CanvasCourse = {
  id: number; name: string; course_code: string | null;
  term?: { name: string } | null;
};
type CanvasModule = { id: number; name: string; items: CanvasModuleItem[] };
type CanvasPage   = { title: string; body: string | null; html_url: string | null };

export type SyncResult = {
  status:            "success" | "partial" | "error";
  coursesProcessed:  number;
  tasksUpserted:     number;
  readingsExtracted: number;
  durationMs:        number;
  pageLog:           { course: string; page: string; bodyLen: number; extracted: number; error?: string }[];
  error?:            string;
};

/**
 * Result of the "task" phase — fast (< 60s), no AI.
 * Returns the list of course ids that have pages for AI so the caller can
 * drive per-course AI invocations without re-querying Turso.
 */
export type TaskSyncResult = {
  status:            "success" | "error";
  coursesProcessed:  number;
  tasksUpserted:     number;
  pagesForAI:        number;
  courseIds:         string[];
  durationMs:        number;
  error?:            string;
};

/**
 * Result of an AI pass for a single course. Always returns 200 from the
 * route handler so the workflow can keep iterating through remaining
 * courses even if one fails.
 */
export type CourseAIResult = {
  status:            "success" | "skipped" | "error";
  courseId:          string;
  courseName:        string;
  pagesProcessed:    number;
  readingsExtracted: number;
  durationMs:        number;
  pageLog?:          { course: string; page: string; bodyLen: number; extracted: number; error?: string }[];
  error?:            string;
};

const CANVAS_BASE = process.env.CANVAS_BASE_URL!;
const BEARER      = process.env.CANVAS_BEARER_TOKEN!;

async function fetchPage(courseId: string, pageUrl: string): Promise<CanvasPage | null> {
  try {
    const res = await fetch(
      `${CANVAS_BASE}/api/v1/courses/${courseId}/pages/${pageUrl}`,
      { headers: { Authorization: `Bearer ${BEARER}` }, next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    return (await res.json()) as CanvasPage;
  } catch { return null; }
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, " ")
    .trim().slice(0, 2000) || null;
}

export async function runSync(): Promise<SyncResult> {
  const startedAt = Date.now();

  // Run the task phase, then drive AI per-course so each call stays under
  // Vercel Hobby's 60s serverless ceiling. runAIForCourse always returns
  // a CourseAIResult, even on failure, so one bad course doesn't block others.
  const taskResult = await runTaskSync();
  if (taskResult.status === "error") {
    return {
      status:            "error",
      coursesProcessed:  taskResult.coursesProcessed,
      tasksUpserted:     taskResult.tasksUpserted,
      readingsExtracted: 0,
      durationMs:        taskResult.durationMs,
      pageLog:           [],
      error:             taskResult.error,
    };
  }

  let readingsExtracted = 0;
  const allPageLog: SyncResult["pageLog"] = [];
  for (const id of taskResult.courseIds) {
    const r = await runAIForCourse(id);
    readingsExtracted += r.readingsExtracted;
    if (r.pageLog) allPageLog.push(...r.pageLog);
  }

  return {
    status:            "success",
    coursesProcessed:  taskResult.coursesProcessed,
    tasksUpserted:     taskResult.tasksUpserted,
    readingsExtracted,
    durationMs:        Date.now() - startedAt,
    pageLog:           allPageLog,
  };
}

/**
 * Phase 1: pull courses + tasks from Canvas and upsert them into Turso.
 * Does NOT run AI extraction — that's a separate phase.
 *
 * Fast enough to fit in Vercel Hobby's 60s ceiling even with 9+ courses.
 * Returns the discovered course ids so the caller can drive per-course
 * AI invocations without re-querying Turso.
 */
export async function runTaskSync(): Promise<TaskSyncResult> {
  const startedAt       = Date.now();
  let coursesProcessed  = 0;
  let tasksUpserted     = 0;
  let pagesForAITotal   = 0;
  const courseIds: string[] = [];

  try {
    const canvasCourses = await fetchAllPages<CanvasCourse>("/courses", {
      params: { enrollment_state: "active" },
    });

    for (const course of canvasCourses) {
      const courseId   = String(course.id);
      const courseName = course.name;
      courseIds.push(courseId);

      await db.insert(courses).values({
        canvasId: courseId, name: courseName,
        courseCode: course.course_code ?? null,
        term: course.term?.name ?? null,
        lastSeenAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: courses.canvasId,
        set: { name: courseName, courseCode: course.course_code ?? null,
               term: course.term?.name ?? null, lastSeenAt: new Date().toISOString() },
      });

      const { taskCount, pagesForAI } = await syncCourseTasks(courseId, courseName);
      tasksUpserted    += taskCount;
      pagesForAITotal  += pagesForAI;
      coursesProcessed += 1;
    }

    const durationMs = Date.now() - startedAt;
    await db.insert(syncLog).values({
      status: "success", tasksUpserted, coursesProcessed, durationMs,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
    });

    return {
      status: "success", coursesProcessed, tasksUpserted,
      pagesForAI: pagesForAITotal, courseIds, durationMs,
    };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs   = Date.now() - startedAt;
    await db.insert(syncLog).values({
      status: "error", tasksUpserted, coursesProcessed, errorMessage, durationMs,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
    }).catch(() => {});
    return {
      status: "error", coursesProcessed, tasksUpserted,
      pagesForAI: pagesForAITotal, courseIds, durationMs, error: errorMessage,
    };
  }
}

/**
 * Phase 2: re-fetch pages for a single course and run AI extraction on them.
 *
 * Re-fetches rather than reading from a queue so each invocation is
 * self-contained — works in any serverless environment and is safe to retry.
 * Returns "skipped" if GROQ_API_KEY is missing (rather than throwing) so a
 * misconfigured prod env degrades gracefully.
 */
export async function runAIForCourse(courseId: string): Promise<CourseAIResult> {
  const startedAt = Date.now();

  if (!process.env.GROQ_API_KEY) {
    return {
      status: "skipped", courseId, courseName: "",
      pagesProcessed: 0, readingsExtracted: 0,
      durationMs: Date.now() - startedAt,
      error: "GROQ_API_KEY not set",
    };
  }

  try {
    // Look up the course name (fallback to id if missing — shouldn't happen
    // because runTaskSync just upserted every course).
    const rows = await db.select({ name: courses.name })
      .from(courses)
      .where(sql`${courses.canvasId} = ${courseId}`)
      .limit(1);
    const courseName = rows[0]?.name ?? courseId;

    const { pageMap } = await syncCourseTasks(courseId, courseName);
    const pages = Array.from(pageMap.values());

    if (pages.length === 0) {
      return {
        status: "success", courseId, courseName,
        pagesProcessed: 0, readingsExtracted: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    const { readingsExtracted, pageLog } = await runAIForPages(courseId, courseName, pages);
    return {
      status: "success", courseId, courseName,
      pagesProcessed: pages.length, readingsExtracted,
      durationMs: Date.now() - startedAt,
      pageLog,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`runAIForCourse(${courseId}) failed:`, err);
    return {
      status: "error", courseId, courseName: "",
      pagesProcessed: 0, readingsExtracted: 0,
      durationMs: Date.now() - startedAt,
      error: errorMessage,
    };
  }
}

/**
 * Internal helper: pull assignments + module pages for one course from Canvas
 * and upsert tasks into Turso. Returns the pageMap so the AI phase can
 * iterate over page bodies without re-fetching from Canvas itself.
 *
 * Note: this *also* re-upserts tasks on every call. That's idempotent
 * (onConflictDoUpdate) and the only way to keep `runAIForCourse` self-
 * contained for retry safety. The cost is one extra bulk of UPDATEs per
 * course per sync, which is negligible.
 */
async function syncCourseTasks(courseId: string, courseName: string): Promise<{
  pageMap:    Map<string, CanvasPage>;
  taskCount:  number;
  pagesForAI: number;
}> {
  const [assignments, modules] = await Promise.all([
    fetchAllPages<CanvasAssignment>(`/courses/${courseId}/assignments`),
    fetchAllPages<CanvasModule>(`/courses/${courseId}/modules`, {
      params: { "include[]": "items" },
    }),
  ]);

  const moduleItems: CanvasModuleItem[] = modules.flatMap((m) => m.items ?? []);
  const pageItems = moduleItems.filter((m) => m.type === "Page" && m.page_url);

  const pageResults = await Promise.all(
    pageItems.map((m) => fetchPage(courseId, m.page_url!))
  );

  const pageMap = new Map<string, CanvasPage>();
  pageItems.forEach((m, i) => {
    if (pageResults[i]) pageMap.set(m.page_url!, pageResults[i]!);
  });

  const newTasks = [
    ...assignments.map((a) => assignmentToTask(a, courseId)),
    ...moduleItems.map((m) => {
      const task = moduleItemToTask(m, courseId);
      if (m.type === "Page" && m.page_url && pageMap.has(m.page_url)) {
        task.description = stripHtml(pageMap.get(m.page_url)!.body ?? null);
      }
      return task;
    }),
  ];

  for (const task of newTasks) {
    await db.insert(tasks).values(task).onConflictDoUpdate({
      target: [tasks.canvasId, tasks.sourceType],
      set: {
        title: task.title, itemType: task.itemType, dueAt: task.dueAt,
        pointsPossible: task.pointsPossible, url: task.url,
        description: task.description, lastSyncedAt: task.lastSyncedAt,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  const pagesForAI = Array.from(pageMap.values()).filter((p) => (p.body ?? "").length >= 50).length;

  return { pageMap, taskCount: newTasks.length, pagesForAI };
}

/**
 * Internal helper: run AI extraction on a list of pages for one course,
 * with per-page logging. Sequential — not Promise.all — so we stay under
 * the Groq free-tier TPM cap (8000/min).
 */
async function runAIForPages(
  courseId:   string,
  courseName: string,
  pages:      CanvasPage[],
): Promise<{
  readingsExtracted: number;
  pageLog:           CourseAIResult["pageLog"];
}> {
  let readingsExtracted = 0;
  const pageLog: NonNullable<CourseAIResult["pageLog"]> = [];

  for (const page of pages) {
    const body    = page.body ?? "";
    const bodyLen = body.length;
    const logEntry: NonNullable<CourseAIResult["pageLog"]>[0] = {
      course:   courseName,
      page:     page.title,
      bodyLen,
      extracted: 0,
    };

    if (bodyLen < 50) {
      logEntry.error = "too short, skipped";
      pageLog.push(logEntry);
      continue;
    }

    try {
      const readings = await extractReadings(page.title, body, courseName);
      logEntry.extracted = readings.length;

      for (const r of readings) {
        await db.insert(readingItems).values({
          courseCanvasId: courseId,
          courseName,
          lectureLabel:   r.lectureLabel,
          readingText:    r.readingText,
          detail:         r.detail ?? null,
          sourcePageUrl:  page.html_url ?? null,
          createdAt:      new Date().toISOString(),
          updatedAt:      new Date().toISOString(),
        }).onConflictDoNothing();
        readingsExtracted++;
      }
    } catch (err) {
      logEntry.error = String(err);
    }

    pageLog.push(logEntry);
  }

  return { readingsExtracted, pageLog };
}
