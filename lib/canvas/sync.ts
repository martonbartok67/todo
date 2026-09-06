import { db } from "@/lib/db";
import { courses, tasks, syncLog } from "@/drizzle/schema";
import { fetchAllPages } from "./client";
import {
  assignmentToTask,
  moduleItemToTask,
  type CanvasAssignment,
  type CanvasModuleItem,
} from "./transform";

type CanvasCourse = {
  id: number;
  name: string;
  course_code: string | null;
  term?: { name: string } | null;
};

type CanvasModule = {
  id: number;
  name: string;
  items: CanvasModuleItem[];
};

type CanvasPage = {
  body: string | null;
};

export type SyncResult = {
  status: "success" | "partial" | "error";
  coursesProcessed: number;
  tasksUpserted: number;
  durationMs: number;
  error?: string;
};

const CANVAS_BASE = process.env.CANVAS_BASE_URL!;
const BEARER      = process.env.CANVAS_BEARER_TOKEN!;

/** Fetch a Canvas wiki page body (HTML) for a given course + page_url slug. */
async function fetchPageBody(courseId: string, pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${CANVAS_BASE}/api/v1/courses/${courseId}/pages/${pageUrl}`,
      { headers: { Authorization: `Bearer ${BEARER}` }, next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as CanvasPage;
    return data.body ?? null;
  } catch {
    return null;
  }
}

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000) || null;
}

export async function runSync(): Promise<SyncResult> {
  const startedAt = new Date();
  let coursesProcessed = 0;
  let tasksUpserted    = 0;

  try {
    const canvasCourses = await fetchAllPages<CanvasCourse>("/courses", {
      params: { enrollment_state: "active" },
    });

    for (const course of canvasCourses) {
      const courseId = String(course.id);

      await db.insert(courses).values({
        canvasId:   courseId,
        name:       course.name,
        courseCode: course.course_code ?? null,
        term:       course.term?.name ?? null,
        lastSeenAt: new Date().toISOString(),
      }).onConflictDoUpdate({
        target: courses.canvasId,
        set: {
          name:       course.name,
          courseCode: course.course_code ?? null,
          term:       course.term?.name ?? null,
          lastSeenAt: new Date().toISOString(),
        },
      });

      const [assignments, modules] = await Promise.all([
        fetchAllPages<CanvasAssignment>(`/courses/${courseId}/assignments`),
        fetchAllPages<CanvasModule>(`/courses/${courseId}/modules`, {
          params: { "include[]": "items" },
        }),
      ]);

      const moduleItems: CanvasModuleItem[] = modules.flatMap((m) => m.items ?? []);

      // Fetch Page body for module items of type "Page"
      const pageItems = moduleItems.filter((m) => m.type === "Page" && m.page_url);
      const pageBodies = await Promise.all(
        pageItems.map((m) => fetchPageBody(courseId, m.page_url!))
      );
      const pageBodyMap = new Map<number, string | null>();
      pageItems.forEach((m, i) => pageBodyMap.set(m.id, pageBodies[i]));

      const newTasks = [
        ...assignments.map((a) => assignmentToTask(a, courseId)),
        ...moduleItems.map((m) => {
          const task = moduleItemToTask(m, courseId);
          if (m.type === "Page" && pageBodyMap.has(m.id)) {
            task.description = stripHtml(pageBodyMap.get(m.id) ?? null);
          }
          return task;
        }),
      ];

      for (const task of newTasks) {
        await db.insert(tasks).values(task).onConflictDoUpdate({
          target: [tasks.canvasId, tasks.sourceType],
          set: {
            title:          task.title,
            itemType:       task.itemType,
            dueAt:          task.dueAt,
            pointsPossible: task.pointsPossible,
            url:            task.url,
            description:    task.description,
            lastSyncedAt:   task.lastSyncedAt,
            updatedAt:      new Date().toISOString(),
          },
        });
      }

      tasksUpserted    += newTasks.length;
      coursesProcessed += 1;
    }

    const durationMs = Date.now() - startedAt.getTime();
    await db.insert(syncLog).values({
      status: "success", tasksUpserted, coursesProcessed, durationMs,
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    });

    return { status: "success", coursesProcessed, tasksUpserted, durationMs };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs   = Date.now() - startedAt.getTime();
    await db.insert(syncLog).values({
      status: "error", tasksUpserted, coursesProcessed, errorMessage, durationMs,
      startedAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    }).catch(() => {});
    return { status: "error", coursesProcessed, tasksUpserted, durationMs, error: errorMessage };
  }
}
