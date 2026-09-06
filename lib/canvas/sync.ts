import { db } from "@/lib/db";
import { courses, tasks, syncLog, readingItems } from "@/drizzle/schema";
import { fetchAllPages } from "./client";
import { assignmentToTask, moduleItemToTask, type CanvasAssignment, type CanvasModuleItem } from "./transform";
import { looksLikeSyllabus, extractReadings } from "./extract";

type CanvasCourse = {
  id: number; name: string; course_code: string | null;
  term?: { name: string } | null;
};
type CanvasModule = { id: number; name: string; items: CanvasModuleItem[] };
type CanvasPage   = { title: string; body: string | null; html_url: string | null };

export type SyncResult = {
  status: "success" | "partial" | "error";
  coursesProcessed: number;
  tasksUpserted:    number;
  readingsExtracted: number;
  durationMs:       number;
  error?:           string;
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
  const startedAt       = new Date();
  let coursesProcessed  = 0;
  let tasksUpserted     = 0;
  let readingsExtracted = 0;

  try {
    const canvasCourses = await fetchAllPages<CanvasCourse>("/courses", {
      params: { enrollment_state: "active" },
    });

    for (const course of canvasCourses) {
      const courseId   = String(course.id);
      const courseName = course.name;

      // Upsert course
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

      // Map page_url → full page data
      const pageMap = new Map<string, CanvasPage>();
      pageItems.forEach((m, i) => {
        if (pageResults[i]) pageMap.set(m.page_url!, pageResults[i]!);
      });

      // Upsert tasks
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
      tasksUpserted += newTasks.length;

      // AI extraction — only on syllabus-like pages
      for (const [pageUrl, page] of Array.from(pageMap.entries())) {
        const body = page.body ?? "";
        if (!looksLikeSyllabus(page.title, body)) continue;

        const readings = await extractReadings(page.title, body, courseName);
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
      }

      coursesProcessed++;
    }

    const durationMs = Date.now() - startedAt.getTime();
    await db.insert(syncLog).values({
      status: "success", tasksUpserted, coursesProcessed, durationMs,
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    });

    return { status: "success", coursesProcessed, tasksUpserted, readingsExtracted, durationMs };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs   = Date.now() - startedAt.getTime();
    await db.insert(syncLog).values({
      status: "error", tasksUpserted, coursesProcessed, errorMessage, durationMs,
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    }).catch(() => {});
    return { status: "error", coursesProcessed, tasksUpserted, readingsExtracted, durationMs, error: errorMessage };
  }
}
