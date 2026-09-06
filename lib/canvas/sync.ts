import { db } from "@/lib/db";
import { courses, tasks, syncLog, readingItems } from "@/drizzle/schema";
import { sql } from "drizzle-orm";
import { fetchAllPages } from "./client";
import { assignmentToTask, moduleItemToTask, type CanvasAssignment, type CanvasModuleItem } from "./transform";
import { extractReadings, type ExtractedReading } from "./extract";

type CanvasCourse = {
  id: number; name: string; course_code: string | null;
  term?: { name: string } | null;
};
type CanvasModule = { id: number; name: string; items: CanvasModuleItem[] };
type CanvasPage   = { title: string; body: string | null; html_url: string | null };

export type SyncResult = {
  status: "success" | "error";
  coursesProcessed:  number;
  tasksUpserted:     number;
  readingsExtracted: number;
  durationMs:        number;
  error?:            string;
};

/**
 * Pages queued for AI reading extraction. The next cron run picks them up.
 */
type PendingExtraction = {
  courseId:   string;
  courseName: string;
  pages:      CanvasPage[];
};

const CANVAS_BASE = process.env.CANVAS_BASE_URL!;
const BEARER      = process.env.CANVAS_BEARER_TOKEN!;

/**
 * Concurrency cap for Groq API calls. Tier-1 Groq accounts rate-limit at
 * ~30 req/min — 4 in flight keeps us safely under that.
 */
const AI_CONCURRENCY = 4;

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

/**
 * Run AI extraction for queued pages in one pass. With GitHub Actions as
 * the cron caller there's no serverless timeout, so pages can take as long
 * as they need. The unique index on reading_items still makes the inserts
 * idempotent if we ever do need to retry a partial run.
 */
async function processAI(
  pending: PendingExtraction[],
): Promise<{ extracted: number }> {
  if (pending.length === 0 || !process.env.GROQ_API_KEY) {
    return { extracted: 0 };
  }

  let extracted = 0;

  for (const { courseId, courseName, pages } of pending) {
    try {
      const readingsByPage: ExtractedReading[][] = [];
      for (let i = 0; i < pages.length; i += AI_CONCURRENCY) {
        const slice = pages.slice(i, i + AI_CONCURRENCY);
        const batch = await Promise.all(
          slice.map((p) => extractReadings(p.title, p.body ?? "", courseName))
        );
        readingsByPage.push(...batch);
      }

      const nowIso = new Date().toISOString();
      const rows = readingsByPage.flatMap((rs, i) =>
        rs.map((r) => ({
          courseCanvasId: courseId,
          courseName,
          lectureLabel:   r.lectureLabel,
          readingText:    r.readingText,
          detail:         r.detail ?? null,
          sourcePageUrl:  pages[i].html_url ?? null,
          createdAt:      nowIso,
          updatedAt:      nowIso,
        }))
      );

      if (rows.length > 0) {
        await db.insert(readingItems).values(rows).onConflictDoNothing();
        extracted += rows.length;
      }
    } catch (err) {
      // Per-course failure: log and continue with the next course so one
      // bad response doesn't poison the whole sync.
      console.error(`processAI failed for course ${courseId}:`, err);
    }
  }

  return { extracted };
}

/**
 * Critical-path sync: pulls courses/tasks from Canvas and upserts them into
 * Turso. AI reading extraction runs to completion (no time budget needed —
 * GitHub Actions is the caller and has no 10s serverless ceiling).
 */
export async function runSync(): Promise<SyncResult> {
  const startedAt       = Date.now();
  let coursesProcessed  = 0;
  let tasksUpserted     = 0;
  const pendingAI: PendingExtraction[] = [];

  try {
    const canvasCourses = await fetchAllPages<CanvasCourse>("/courses", {
      params: { enrollment_state: "active" },
    });

    for (const course of canvasCourses) {
      const courseId   = String(course.id);
      const courseName = course.name;

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

      const [assignments, modules] = await Promise.all([
        fetchAllPages<CanvasAssignment>(`/courses/${courseId}/assignments`),
        fetchAllPages<CanvasModule>(`/courses/${courseId}/modules`, {
          params: { "include[]": "items" },
        }),
      ]);

      const moduleItems: CanvasModuleItem[] = modules.flatMap((m) => m.items ?? []);
      const pageItems = moduleItems.filter((m) => m.type === "Page" && m.page_url);

      // Fetch all pages in parallel
      const pageResults = await Promise.all(
        pageItems.map((m) => fetchPage(courseId, m.page_url!))
      );

      const pageMap = new Map<string, CanvasPage>();
      pageItems.forEach((m, i) => {
        if (pageResults[i]) pageMap.set(m.page_url!, pageResults[i]!);
      });

      // Upsert tasks — single bulk insert instead of one round-trip per row.
      // Drizzle's `.values([...])` + onConflictDoUpdate produces one Turso HTTP
      // call covering the whole course, instead of N.
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

      if (newTasks.length > 0) {
        const nowIso = new Date().toISOString();
        await db.insert(tasks).values(newTasks).onConflictDoUpdate({
          target: [tasks.canvasId, tasks.sourceType],
          set: {
            title:          sql`excluded.title`,
            itemType:       sql`excluded.item_type`,
            dueAt:          sql`excluded.due_at`,
            pointsPossible: sql`excluded.points_possible`,
            url:            sql`excluded.url`,
            description:    sql`excluded.description`,
            lastSyncedAt:   sql`excluded.last_synced_at`,
            updatedAt:      nowIso,
          },
        });
      }
      tasksUpserted += newTasks.length;

      // Queue pages for AI extraction. processAI() below runs to completion —
      // no time budget needed since the GitHub Actions runner is the caller.
      const pagesForAI = Array.from(pageMap.values()).filter(
        (p) => (p.body ?? "").length >= 100
      );
      if (pagesForAI.length > 0) {
        pendingAI.push({ courseId, courseName, pages: pagesForAI });
      }

      coursesProcessed++;
    }

    // Run AI extraction to completion. Per-course failures are logged and
    // skipped, so one bad response doesn't poison the whole sync.
    const ai = await processAI(pendingAI);
    const readingsExtracted = ai.extracted;

    const durationMs = Date.now() - startedAt;
    await db.insert(syncLog).values({
      status: "success", tasksUpserted, coursesProcessed, durationMs,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
    });

    return {
      status: "success", coursesProcessed, tasksUpserted,
      readingsExtracted, durationMs,
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
      readingsExtracted: 0, durationMs, error: errorMessage,
    };
  }
}