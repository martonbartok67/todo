/**
 * Canvas sync orchestrator.
 * Fetches courses → assignments + module items → upserts into Turso.
 * Called by POST /api/sync (cron) and optionally by a manual trigger.
 */
import { db } from "@/lib/db";
import { courses, tasks, syncLog } from "@/drizzle/schema";
import { fetchAllPages } from "./client";
import {
  assignmentToTask,
  moduleItemToTask,
  type CanvasAssignment,
  type CanvasModuleItem,
} from "./transform";
import { eq, sql } from "drizzle-orm";

type CanvasCourse = {
  id: number;
  name: string;
  course_code: string | null;
  term?: { name: string } | null;
  enrollment_state: string;
};

type CanvasModule = {
  id: number;
  name: string;
  items: CanvasModuleItem[];
};

export type SyncResult = {
  status: "success" | "partial" | "error";
  coursesProcessed: number;
  tasksUpserted: number;
  durationMs: number;
  error?: string;
};

export async function runSync(): Promise<SyncResult> {
  const startedAt = new Date();
  let coursesProcessed = 0;
  let tasksUpserted    = 0;
  let errorMessage: string | undefined;

  try {
    // 1. Fetch active courses
    const canvasCourses = await fetchAllPages<CanvasCourse>("/courses", {
      params: { enrollment_state: "active" },
    });

    for (const course of canvasCourses) {
      const courseId = String(course.id);

      // 2. Upsert course
      await db
        .insert(courses)
        .values({
          canvasId:   courseId,
          name:       course.name,
          courseCode: course.course_code ?? null,
          term:       course.term?.name ?? null,
          lastSeenAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: courses.canvasId,
          set: {
            name:       course.name,
            courseCode: course.course_code ?? null,
            term:       course.term?.name ?? null,
            lastSeenAt: new Date().toISOString(),
          },
        });

      // 3. Fetch assignments (paginated)
      const assignments = await fetchAllPages<CanvasAssignment>(
        `/courses/${courseId}/assignments`
      );

      // 4. Fetch modules with items embedded (paginated)
      const modules = await fetchAllPages<CanvasModule>(
        `/courses/${courseId}/modules`,
        { params: { "include[]": "items" } }
      );

      // 5. Flatten module items
      const moduleItems: CanvasModuleItem[] = modules.flatMap(
        (m) => m.items ?? []
      );

      // 6. Build unified task list
      const newTasks = [
        ...assignments.map((a) => assignmentToTask(a, courseId)),
        ...moduleItems.map((m) => moduleItemToTask(m, courseId)),
      ];

      // 7. Upsert all tasks
      // Conflict target: (canvas_id, source_type)
      // Preserve completedAt and snoozedUntil — never overwrite local state.
      for (const task of newTasks) {
        await db
          .insert(tasks)
          .values(task)
          .onConflictDoUpdate({
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
              // completedAt and snoozedUntil intentionally NOT overwritten
            },
          });
      }

      tasksUpserted    += newTasks.length;
      coursesProcessed += 1;
    }

    const durationMs = Date.now() - startedAt.getTime();

    await db.insert(syncLog).values({
      status:           "success",
      tasksUpserted,
      coursesProcessed,
      durationMs,
      startedAt:        startedAt.toISOString(),
      finishedAt:       new Date().toISOString(),
    });

    return { status: "success", coursesProcessed, tasksUpserted, durationMs };

  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startedAt.getTime();

    await db.insert(syncLog).values({
      status:           "error",
      tasksUpserted,
      coursesProcessed,
      errorMessage,
      durationMs,
      startedAt:        startedAt.toISOString(),
      finishedAt:       new Date().toISOString(),
    }).catch(() => {}); // don't throw if log write also fails

    return {
      status: "error",
      coursesProcessed,
      tasksUpserted,
      durationMs,
      error: errorMessage,
    };
  }
}
