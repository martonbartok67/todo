import { db } from "@/lib/db";
import { courses, tasks, syncLog, readingItems, timetableEvents } from "@/drizzle/schema";
import { fetchAllPages } from "./client";
import { assignmentToTask, moduleItemToTask, type CanvasAssignment, type CanvasModuleItem } from "./transform";
import { extractReadings } from "./extract";
import { sql, eq } from "drizzle-orm";

type CanvasCourse = {
  id: number; name: string; course_code: string | null;
  term?: { name: string } | null;
};
type CanvasModule = { id: number; name: string; items: CanvasModuleItem[] };
type CanvasPage   = { title: string; body: string | null; html_url: string | null };

/**
 * Course ids we never want to run AI on — onboarding boards, exchange
 * programmes, notice boards, etc. that have no reading content. Tasks still
 * sync for these; only the AI extraction is suppressed.
 */
const SKIP_AI_COURSE_IDS: ReadonlySet<string> = new Set([
  "43161", // RSM Bachelor Exchange
  "42446", // IBA Notice Board
  "56741", // BSc IBA Student Onboarding
  "56744", // Bachelor 1 IBA
]);

/**
 * Skip AI for courses whose name contains any of these keywords. The user
 * explicitly said Math (57923) has no readings — only videos. New courses
 * matching the pattern auto-skip.
 */
const SKIP_AI_COURSE_NAME_KEYWORDS: readonly string[] = [
  "mathematics", "math", "wiskunde", "calculus", "statistics",
];

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
  // All active course ids, in Canvas order. Used by the workflow for tasks.
  courseIds:         string[];
  // Subset of courseIds that are eligible for AI extraction (after skip
  // rules for onboarding boards, math courses, etc.). The workflow should
  // drive AI invocations over this list, not courseIds.
  courseIdsForAI:    string[];
  durationMs:        number;
  error?:            string;
};

/**
 * Result of an AI pass for a single course. Always returns 200 from the
 * route handler so the workflow can keep iterating through remaining
 * courses even if one fails.
 *
 * `pagesTotal` is the total number of pages in the course (or in scope);
 * if `nextOffset` is non-null, more pages remain and the workflow should
 * call again with that offset. This is how we stay under Vercel Hobby's
 * 60s ceiling for courses with hundreds of pages.
 */
export type CourseAIResult = {
  status:            "success" | "skipped" | "error";
  courseId:          string;
  courseName:        string;
  pagesProcessed:    number;
  pagesTotal:        number;
  readingsExtracted: number;
  durationMs:        number;
  nextOffset:        number | null;
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
    // Walk through pages in batches of 20 until exhausted. Each call is
    // its own serverless invocation in production, so this matches what
    // the workflow does for us. We pass a generous limit here because
    // runSync() runs in a single process.
    let offset = 0;
    for (;;) {
      const r = await runAIForCourse(id, { offset, limit: 20 });
      readingsExtracted += r.readingsExtracted;
      if (r.pageLog) allPageLog.push(...r.pageLog);
      if (r.nextOffset === null) break;
      offset = r.nextOffset;
    }
  }

  // Best-effort: pull upcoming calendar events too. Failures here don't
  // poison the rest of the sync — the user is just stuck without a
  // timetable view until the next run.
  await runTimetableSync().catch((err) => {
    console.error("runSync: runTimetableSync failed (continuing):", err);
  });

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
  const courseIdsForAI: string[] = [];

  try {
    const canvasCourses = await fetchAllPages<CanvasCourse>("/courses", {
      params: { enrollment_state: "active" },
    });

    for (const course of canvasCourses) {
      const courseId   = String(course.id);
      const courseName = course.name;
      courseIds.push(courseId);
      if (shouldRunAI(courseId, courseName)) courseIdsForAI.push(courseId);

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
      pagesForAI: pagesForAITotal, courseIds, courseIdsForAI, durationMs,
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
      pagesForAI: pagesForAITotal, courseIds, courseIdsForAI, durationMs, error: errorMessage,
    };
  }
}

/**
 * Decide whether a course should be sent through AI extraction.
 * Excludes onboarding / notice-board / exchange / math courses.
 */
function shouldRunAI(courseId: string, courseName: string): boolean {
  if (SKIP_AI_COURSE_IDS.has(courseId)) return false;
  const lc = courseName.toLowerCase();
  return !SKIP_AI_COURSE_NAME_KEYWORDS.some((kw) => lc.includes(kw));
}

/**
 * Phase 2: re-fetch pages for a single course and run AI extraction on them.
 *
 * Re-fetches rather than reading from a queue so each invocation is
 * self-contained — works in any serverless environment and is safe to retry.
 * Returns "skipped" if GROQ_API_KEY is missing (rather than throwing) so a
 * misconfigured prod env degrades gracefully.
 *
 * In addition to Canvas pages, we also build one synthetic "page" per
 * module so the AI sees the course structure (module names + their item
 * titles). This is where the actual reading list usually lives at EUR,
 * not in standalone Pages.
 *
 * For courses with many pages, the workflow can paginate by calling this
 * with `offset` and `limit` until `nextOffset` is null.
 */
export async function runAIForCourse(
  courseId: string,
  options: { offset?: number; limit?: number } = {},
): Promise<CourseAIResult> {
  const startedAt = Date.now();
  const offset    = options.offset ?? 0;
  const limit     = options.limit  ?? 20;

  if (!process.env.GROQ_API_KEY) {
    return {
      status: "skipped", courseId, courseName: "",
      pagesProcessed: 0, pagesTotal: 0, readingsExtracted: 0,
      durationMs: Date.now() - startedAt, nextOffset: null,
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

    // Build the full page list: real Canvas Pages + one synthetic page per
    // module derived from the module structure. Skip AI for ineligible
    // courses (math, onboarding boards) before doing any work.
    if (!shouldRunAI(courseId, courseName)) {
      return {
        status: "skipped", courseId, courseName,
        pagesProcessed: 0, pagesTotal: 0, readingsExtracted: 0,
        durationMs: Date.now() - startedAt, nextOffset: null,
        error: "course on SKIP_AI_COURSE_IDS or matched SKIP_AI_COURSE_NAME_KEYWORDS",
      };
    }

    const { pageMap, modules } = await syncCourseTasks(courseId, courseName);
    const allPages: Array<{ kind: "page" | "module"; title: string; body: string; html_url: string | null }> = [];

    for (const p of Array.from(pageMap.values())) {
      allPages.push({ kind: "page", title: p.title, body: p.body ?? "", html_url: p.html_url });
    }
    for (const mod of modules) {
      const synthetic = buildModulePageBody(mod);
      if (synthetic) {
        allPages.push({
          kind: "module",
          title: mod.name,
          body: synthetic,
          html_url: `https://canvas.eur.nl/courses/${courseId}/modules#${mod.id}`,
        });
      }
    }

    const total = allPages.length;

    if (total === 0 || offset >= total) {
      return {
        status: "success", courseId, courseName,
        pagesProcessed: 0, pagesTotal: total, readingsExtracted: 0,
        durationMs: Date.now() - startedAt, nextOffset: null,
      };
    }

    const batch = allPages.slice(offset, offset + limit);
    const lastIdx = offset + batch.length;
    const nextOffset = lastIdx < total ? lastIdx : null;

    if (batch.length === 0) {
      return {
        status: "success", courseId, courseName,
        pagesProcessed: 0, pagesTotal: total, readingsExtracted: 0,
        durationMs: Date.now() - startedAt, nextOffset: null,
      };
    }

    const { readingsExtracted, pageLog } = await runAIForPages(courseId, courseName, batch);
    return {
      status: "success", courseId, courseName,
      pagesProcessed: batch.length, pagesTotal: total, readingsExtracted,
      durationMs: Date.now() - startedAt, nextOffset,
      pageLog,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`runAIForCourse(${courseId}) failed:`, err);
    return {
      status: "error", courseId, courseName: "",
      pagesProcessed: 0, pagesTotal: 0, readingsExtracted: 0,
      durationMs: Date.now() - startedAt, nextOffset: null,
      error: errorMessage,
    };
  }
}

/**
 * Build a text body for a module that lists its items. This is the
 * "synthetic page" we hand to Groq so it can see course structure even
 * when the actual reading content is a PDF / ExternalUrl that we can't
 * parse.
 *
 * Returns null if the module has no useful items (SubHeaders only) so
 * the caller can skip it.
 */
function buildModulePageBody(mod: CanvasModule): string | null {
  const lines: string[] = [];
  lines.push(`Module: ${mod.name}`);

  // Track which external urls / files / pages might be reading material.
  for (const it of mod.items ?? []) {
    if (!it.title) continue;
    if (it.type === "SubHeader") continue; // decorative
    const tag = `[${it.type}]`;
    const url = it.html_url || it.external_url || "";
    lines.push(`- ${tag} ${it.title}${url ? ` (${url})` : ""}`);
  }

  // If the only items were SubHeaders, skip — nothing useful to extract.
  const usefulCount = (mod.items ?? []).filter((it) => it.type !== "SubHeader").length;
  if (usefulCount === 0) return null;

  return lines.join("\n");
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
  modules:    CanvasModule[];
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

  // Conditionally fetch page bodies. The body is only needed to populate
  // `description` for non-AI pages and to feed Groq in the AI phase. If
  // there are too many pages (e.g. 154 for the RSM Bachelor Exchange
  // onboarding course), the round-trip cost can blow Vercel Hobby's 60s
  // ceiling. We skip the body fetch in that case so the task phase stays
  // fast; the AI phase will re-fetch bodies per-course as needed (one
  // serverless invocation per course).
  const FETCH_BODIES_THRESHOLD = 50; // pages; above this, skip body fetch
  const shouldFetchBodies = pageItems.length <= FETCH_BODIES_THRESHOLD;
  const pageResults = shouldFetchBodies
    ? await Promise.all(pageItems.map((m) => fetchPage(courseId, m.page_url!)))
    : pageItems.map(() => null);

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

  if (newTasks.length > 0) {
    const nowIso = new Date().toISOString();
    // Single bulk insert instead of one round-trip per row.
    // Vercel Hobby has a 60s function ceiling; with ~600 tasks per sync the
    // per-row variant took ~60s by itself, blowing the cap before the AI
    // phase ever ran. Drizzle's `.values([...])` + onConflictDoUpdate
    // produces one Turso HTTP call covering the whole course.
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

  const pagesForAI = Array.from(pageMap.values()).filter((p) => (p.body ?? "").length >= 50).length;

  return { pageMap, modules, taskCount: newTasks.length, pagesForAI };
}

/**
 * Internal helper: run AI extraction on a list of pages for one course,
 * with per-page logging. Sequential — not Promise.all — so we stay under
 * the Groq free-tier TPM cap (8000/min).
 */
/** A page-like thing fed to Groq for extraction. */
type ExtractionPage = { title: string; body: string; html_url: string | null };

async function runAIForPages(
  courseId:   string,
  courseName: string,
  pages:      ExtractionPage[],
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

/**
 * Phase 3: pull upcoming calendar events (the student's personal timetable)
 * and upsert them into `timetable_events`.
 *
 * Two sources:
 *   1. The user-level feed `/api/v1/calendar_events` — already covers
 *      assignments (with due dates) and user-added events. Often empty
 *      for new students whose professors haven't pushed anything yet.
 *   2. Per-course feeds `/api/v1/courses/{id}/calendar_events` — same data
 *      but filtered to one course; useful as a fallback. (Note: many
 *      institutions gate this behind teacher permissions and it returns
 *      HTML for students, so we just rely on the user feed.)
 *
 * Returns the number of events inserted/updated and skipped.
 */
export type TimetableSyncResult = {
  status:           "success" | "error";
  eventsUpserted:   number;
  pagesScanned:     number; // how many "pages" of calendar_events we walked
  durationMs:       number;
  windowStart:      string;
  windowEnd:        string;
  error?:           string;
};

type CanvasCalendarEvent = {
  id:              number;
  title:           string;
  description?:    string | null;
  start_at:        string | null;
  end_at:          string | null;
  all_day:         boolean;
  context_code?:   string | null;     // e.g. "course_57916"
  location_name?:  string | null;
  html_url?:       string | null;
  type?:           string | null;     // "event" | "assignment" | "calendar"
};

export async function runTimetableSync(options: {
  /** How many weeks ahead to pull. Default 4. */
  weeks?: number;
} = {}): Promise<TimetableSyncResult> {
  const startedAt = Date.now();
  const weeks = options.weeks ?? 4;
  const windowStart = new Date();
  const windowEnd   = new Date(Date.now() + weeks * 7 * 24 * 60 * 60 * 1000);

  try {
    const events = await fetchAllPages<CanvasCalendarEvent>("/calendar_events", {
      params: {
        start_date: windowStart.toISOString(),
        end_date:   windowEnd.toISOString(),
        // type omitted on purpose: include both events and assignments so
        // the user can see assignment due-dates in the timetable view too.
      },
    });

    if (events.length === 0) {
      return {
        status:         "success",
        eventsUpserted: 0,
        pagesScanned:   0,
        durationMs:     Date.now() - startedAt,
        windowStart:    windowStart.toISOString(),
        windowEnd:      windowEnd.toISOString(),
      };
    }

    // Build a lookup of course ids from `context_code` ("course_57916" -> "57916").
    const courseIds = Array.from(new Set(
      events
        .map((e) => (e.context_code ?? "").match(/^course_(\d+)$/)?.[1])
        .filter((x): x is string => !!x)
    ));

    const courseRows = courseIds.length > 0
      ? await db.select({ id: courses.canvasId, name: courses.name })
          .from(courses)
          .where(sql`${courses.canvasId} IN (${sql.join(courseIds.map((c) => sql`${c}`), sql`, `)})`)
      : [];
    const courseNameById = new Map(courseRows.map((r) => [r.id, r.name]));

    let upserted = 0;
    for (const e of events) {
      if (!e.start_at) continue; // need a start time to render in the timetable

      const m        = (e.context_code ?? "").match(/^course_(\d+)$/);
      const courseId = m ? m[1] : null;
      const now      = new Date().toISOString();

      await db.insert(timetableEvents).values({
        canvasId:       String(e.id),
        courseCanvasId: courseId,
        courseName:     courseId ? (courseNameById.get(courseId) ?? null) : null,
        title:          e.title,
        description:    e.description ?? null,
        location:       e.location_name ?? null,
        startAt:        e.start_at,
        endAt:          e.end_at,
        allDay:         !!e.all_day,
        eventType:      e.type ?? null,
        sourceUrl:      e.html_url ?? null,
        createdAt:      now,
        updatedAt:      now,
      }).onConflictDoUpdate({
        target: timetableEvents.canvasId,
        set: {
          courseCanvasId: courseId,
          courseName:     courseId ? (courseNameById.get(courseId) ?? null) : null,
          title:          e.title,
          description:    e.description ?? null,
          location:       e.location_name ?? null,
          startAt:        e.start_at,
          endAt:          e.end_at,
          allDay:         !!e.all_day,
          eventType:      e.type ?? null,
          sourceUrl:      e.html_url ?? null,
          updatedAt:      now,
        },
      });
      upserted++;
    }

    return {
      status:         "success",
      eventsUpserted: upserted,
      pagesScanned:   0,
      durationMs:     Date.now() - startedAt,
      windowStart:    windowStart.toISOString(),
      windowEnd:      windowEnd.toISOString(),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`runTimetableSync failed:`, err);
    return {
      status:         "error",
      eventsUpserted: 0,
      pagesScanned:   0,
      durationMs:     Date.now() - startedAt,
      windowStart:    windowStart.toISOString(),
      windowEnd:      windowEnd.toISOString(),
      error:          errorMessage,
    };
  }
}
