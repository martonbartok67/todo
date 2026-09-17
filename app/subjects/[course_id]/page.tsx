import { notFound } from "next/navigation";
import { db, dbReady } from "@/lib/db";
import { courses, tasks, readingItems } from "@/drizzle/schema";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import {
  getUrgency, withTaskColumnFallback, isMissingColumnError, TASK_COLUMNS_SAFE,
  type EnrichedTask,
} from "@/lib/tasks";
import { READING_COLUMNS_SAFE } from "@/lib/readings";
import { PageChrome } from "@/components/PageChrome";
import { SubjectAccordion, type SubjectResources } from "@/components/SubjectAccordion";
import { ClassifyCourseButton } from "@/components/ClassifyCourseButton";

export const dynamic = "force-dynamic";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ course_id: string }>;
}) {
  const { course_id } = await params;

  // The queries below select full `tasks`/`reading_items` rows, which
  // carry columns that may have just been added — see lib/tasks.ts's
  // fetchPendingRows() for why this awaits dbReady().
  await dbReady();

  const courseRows = await db.select().from(courses)
    .where(eq(courses.canvasId, course_id)).limit(1);
  if (courseRows.length === 0) notFound();
  const course = courseRows[0];

  let enriched: EnrichedTask[] = [];
  let readingRows: typeof readingItems.$inferSelect[] = [];
  let resources: SubjectResources = { items: [] };

  try {
    const where = and(
      eq(tasks.courseCanvasId, course_id),
      isNull(tasks.completedAt),
      ne(tasks.classification, "info"),
    );
    const taskRows = await withTaskColumnFallback(
      () => db
        .select({ task: tasks, courseName: courses.name, accentColor: courses.accentColor })
        .from(tasks)
        .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
        .where(where)
        .orderBy(asc(tasks.dueAt), asc(tasks.title)),
      () => db
        .select({ task: TASK_COLUMNS_SAFE, courseName: courses.name, accentColor: courses.accentColor })
        .from(tasks)
        .leftJoin(courses, eq(tasks.courseCanvasId, courses.canvasId))
        .where(where)
        .orderBy(asc(tasks.dueAt), asc(tasks.title)),
    );

    enriched = taskRows
      .map(({ task, courseName, accentColor }) => ({
        ...task,
        urgency:     getUrgency(task.dueAt),
        courseName:  courseName ?? course.name,
        accentColor: accentColor ?? course.accentColor ?? null,
      }))
      .sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3, none: 4 } as const;
        const u = order[a.urgency] - order[b.urgency];
        if (u !== 0) return u;
        if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
        if (a.dueAt) return -1;
        if (b.dueAt) return 1;
        return a.title.localeCompare(b.title);
      });
  } catch (e) {
    console.error("subject page tasks query failed (non-fatal):", e);
  }

  try {
    const readingWhere = eq(readingItems.courseCanvasId, course_id);
    const readingOrder = [asc(readingItems.lectureLabel), asc(readingItems.readingText)] as const;
    try {
      readingRows = await db.select().from(readingItems).where(readingWhere).orderBy(...readingOrder);
    } catch (e) {
      if (!isMissingColumnError(e)) throw e;
      const safeRows = await db.select(READING_COLUMNS_SAFE).from(readingItems).where(readingWhere).orderBy(...readingOrder);
      readingRows = safeRows.map((r) => ({ ...r, linkedTimetableEventId: null, deadlineConfidence: null }));
    }
  } catch (e) {
    console.error("subject page readings query failed (non-fatal):", e);
  }

  try {
    const resourceWhere = and(eq(tasks.courseCanvasId, course_id), eq(tasks.classification, "info"));
    let resourceRows: { id: number; title: string; classificationReason: string | null; itemType: string | null; url: string | null }[];
    try {
      resourceRows = await db.select().from(tasks).where(resourceWhere).orderBy(asc(tasks.title));
    } catch (e) {
      if (!isMissingColumnError(e)) throw e;
      // Same deadline_source/linked_event_id flakiness as the task query
      // above — this select doesn't need those columns at all, so drop
      // straight to the explicit safe column list instead of re-throwing.
      resourceRows = await db.select(TASK_COLUMNS_SAFE).from(tasks).where(resourceWhere).orderBy(asc(tasks.title));
    }
    resources = {
      items: resourceRows.map((r) => ({
        id:     r.id,
        title:  r.title,
        detail: r.classificationReason ?? r.itemType ?? null,
        url:    r.url,
      })),
    };
  } catch (e) {
    console.error("subject page resources query failed (non-fatal):", e);
  }

  return (
    <PageChrome active="tasks" course={{ id: course.canvasId, name: course.name }}>
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg md:text-base font-semibold tracking-tight truncate">{course.name}</h1>
          {course.courseCode && (
            <p className="text-xs text-muted mt-0.5 font-mono tabular-nums">{course.courseCode}</p>
          )}
        </div>
        <ClassifyCourseButton courseId={course.canvasId} courseName={course.name} variant="header" />
      </header>
      <SubjectAccordion tasks={enriched} readings={readingRows} resources={resources} courseAccent={course.accentColor} />
    </PageChrome>
  );
}
