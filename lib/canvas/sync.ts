import { db } from "@/lib/db";
import { courses, tasks, syncLog, readingItems, timetableEvents, userSettings } from "@/drizzle/schema";
import { fetchAllPages } from "./client";
import { assignmentToTask, moduleItemToTask, type CanvasAssignment, type CanvasModuleItem } from "./transform";
import { extractReadings } from "./extract";
import { classifyItems } from "./classify";
import { sql, eq, and } from "drizzle-orm";

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
  await runIcalSync().catch((err) => {
    console.error("runSync: runIcalSync failed (continuing):", err);
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
        const now = new Date().toISOString();
        await db.insert(readingItems).values({
          courseCanvasId: courseId,
          courseName,
          lectureLabel:   r.lectureLabel,
          readingText:    r.readingText,
          detail:         r.detail ?? null,
          sourcePageUrl:  page.html_url ?? null,
          weekNumber:     r.weekNumber,
          lectureSlot:    r.lectureSlot,
          source:         "ai",
          createdAt:      now,
          updatedAt:      now,
        }).onConflictDoUpdate({
          // Re-extract on a re-run: overwrite week/lecture-slot/detail so
          // the latest AI verdict wins. Leave completedAt, source, and
          // sourcePageUrl alone — those are user/Canvas state.
          target: [
            readingItems.courseCanvasId,
            readingItems.lectureLabel,
            readingItems.readingText,
            readingItems.source,
          ],
          set: {
            weekNumber:  r.weekNumber,
            lectureSlot: r.lectureSlot,
            detail:      r.detail ?? null,
            updatedAt:   now,
          },
        });
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

/**
 * Phase 4: fetch the user's iCal feed (e.g. from MyTimetable) and
 * upsert events into `timetable_events` with `source = 'ical'`.
 */
export type IcalSyncResult = {
  status:         "success" | "skipped" | "error";
  eventsUpserted: number;
  windowStart:    string;
  windowEnd:      string;
  durationMs:     number;
  error?:         string;
};

export async function runIcalSync(): Promise<IcalSyncResult> {
  const startedAt = Date.now();
  const windowStart = new Date();
  // iCal feeds usually cover a full year; the user may subscribe to a
  // shorter window. Keep whatever they sent; expiry isn't our problem.
  const windowEnd   = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  try {
    const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1);
    const settings = rows[0];
    if (!settings?.icalUrl) {
      return {
        status: "skipped", eventsUpserted: 0,
        windowStart: windowStart.toISOString(),
        windowEnd:   windowEnd.toISOString(),
        durationMs:  Date.now() - startedAt,
        error: "no iCal URL configured — visit /timetable to paste one",
      };
    }

    // Fetch the feed. Some servers reject default UAs; emulate a browser.
    const res = await fetch(settings.icalUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (todo-aggregator; +https://github.com/martonbartok67/todo)",
        "Accept":     "text/calendar, text/plain;q=0.9, */*;q=0.5",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`iCal feed returned ${res.status} ${res.statusText}`);
    }
    const ical = await res.text();
    const events = parseIcal(ical);

    if (events.length === 0) {
      return {
        status: "success", eventsUpserted: 0,
        windowStart: windowStart.toISOString(),
        windowEnd:   windowEnd.toISOString(),
        durationMs:  Date.now() - startedAt,
      };
    }

    // Best-effort course lookup. MyTimetable iCal exports typically put the
    // course code in the SUMMARY (e.g. "BT1205 - Professional development &
    // mentoring I"), not in CATEGORIES — so we try CATEGORIES first and
    // fall back to scanning the SUMMARY against a regex made from our
    // known course codes. Keeps matching precise: a generic "[A-Z]{2,}\d{3,}"
    // regex would over-match (RSM, IBA, etc.).
    const courseCodeByName = new Map<string, { id: string; name: string }>();
    const knownCodes: string[] = [];
    const knownCourses = await db.select({ id: courses.canvasId, name: courses.name, code: courses.courseCode })
      .from(courses);
    for (const c of knownCourses) {
      if (c.code) {
        courseCodeByName.set(c.code.toLowerCase(), { id: c.id, name: c.name });
        knownCodes.push(c.code);
      }
    }
    // Escape regex metacharacters in case a code ever contains one,
    // then build a single alternation. Case-insensitive flag matches
    // SUMMARYs written in either case.
    const summaryCodeRegex = knownCodes.length
      ? new RegExp(`\\b(?:${knownCodes.map(escapeRegex).join("|")})\\b`, "i")
      : null;

    let upserted = 0;
    for (const e of events) {
      const now = new Date().toISOString();

      // 1. Try CATEGORIES (comma/semicolon-separated list).
      const cat = (e.categories ?? "").toLowerCase().split(/[,;]/).map((s) => s.trim()).filter(Boolean)[0] ?? "";
      let matched = courseCodeByName.get(cat);

      // 1b. If the first CATEGORIES token wasn't a known code, scan the
      //     whole CATEGORIES string too — MyTimetable sometimes prepends
      //     "Course, " before the code, e.g. "Course, BT1205".
      if (!matched && summaryCodeRegex && e.categories) {
        const m = e.categories.match(summaryCodeRegex);
        if (m) matched = courseCodeByName.get(m[0].toLowerCase());
      }

      // 2. Fall back to a code anywhere in the SUMMARY — common in
      //    MyTimetable exports where SUMMARY is "<CODE> - <title>".
      if (!matched && summaryCodeRegex && e.summary) {
        const m = e.summary.match(summaryCodeRegex);
        if (m) {
          matched = courseCodeByName.get(m[0].toLowerCase());
        }
      }

      await db.insert(timetableEvents).values({
        canvasId:       e.uid,
        source:         "ical",
        courseCanvasId: matched?.id ?? null,
        courseName:     matched?.name ?? null,
        title:          e.summary,
        description:    e.description ?? null,
        location:       e.location ?? null,
        startAt:        e.start.toISOString(),
        endAt:          e.end?.toISOString() ?? null,
        allDay:         e.allDay,
        eventType:      "event",
        sourceUrl:      settings.icalUrl,
        createdAt:      now,
        updatedAt:      now,
      }).onConflictDoUpdate({
        target: timetableEvents.canvasId,
        set: {
          source:         "ical",
          courseCanvasId: matched?.id ?? null,
          courseName:     matched?.name ?? null,
          title:          e.summary,
          description:    e.description ?? null,
          location:       e.location ?? null,
          startAt:        e.start.toISOString(),
          endAt:          e.end?.toISOString() ?? null,
          allDay:         e.allDay,
          eventType:      "event",
          sourceUrl:      settings.icalUrl,
          updatedAt:      now,
        },
      });
      upserted++;
    }

    return {
      status: "success", eventsUpserted: upserted,
      windowStart: windowStart.toISOString(),
      windowEnd:   windowEnd.toISOString(),
      durationMs:  Date.now() - startedAt,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("runIcalSync failed:", err);
    return {
      status: "error", eventsUpserted: 0,
      windowStart: windowStart.toISOString(),
      windowEnd:   windowEnd.toISOString(),
      durationMs:  Date.now() - startedAt,
      error:       errorMessage,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Step 2: AI classification
// ─────────────────────────────────────────────────────────────────────────

/**
 * Result type for `runClassifyForCourse`.
 *
 * Same shape as `CourseAIResult` for consistency — the workflow that
 * iterates courses can drive either AI pass without branching.
 */
export type ClassifyResult2 = {
  status:            "success" | "skipped" | "error";
  courseId:          string;
  courseName:        string;
  itemsClassified:   number;
  itemsFlaggedInfo:  number;
  durationMs:        number;
  error?:            string;
};

/**
 * Classify every task for one course in batches of 30.
 *
 * Only "unclassified" rows are sent to the AI — once a verdict lands
 * we don't re-classify on every cron tick. To force a re-classification
 * (e.g. after the AI prompt changes), call this with `force=true`.
 *
 * Why batches of 30: each item is ~80 tokens once you include the
 * description; 30 fits comfortably in the 8K TPM free-tier ceiling
 * without triggering rate limits.
 */
export async function runClassifyForCourse(
  courseId: string,
  options: { force?: boolean; batchSize?: number } = {},
): Promise<ClassifyResult2> {
  const startedAt   = Date.now();
  const batchSize   = options.batchSize ?? 30;
  const force       = options.force ?? false;

  try {
    // Course lookup (so we can surface its name in the result).
    const courseRows = await db
      .select({ name: courses.name })
      .from(courses)
      .where(eq(courses.canvasId, courseId))
      .limit(1);
    const courseName = courseRows[0]?.name ?? "(unknown)";

    // Pull all unclassified tasks for this course.
    // `force=true` re-classifies everything regardless of current state.
    const where = force
      ? eq(tasks.courseCanvasId, courseId)
      : and(
          eq(tasks.courseCanvasId, courseId),
          eq(tasks.classification, "unclassified"),
        );

    const pending = await db
      .select({
        id:          tasks.id,
        title:       tasks.title,
        description: tasks.description,
        itemType:    tasks.itemType,
      })
      .from(tasks)
      .where(where);

    if (pending.length === 0) {
      return {
        status: "skipped", courseId, courseName,
        itemsClassified: 0, itemsFlaggedInfo: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    if (!process.env.GROQ_API_KEY) {
      return {
        status: "skipped", courseId, courseName,
        itemsClassified: 0, itemsFlaggedInfo: 0,
        durationMs: Date.now() - startedAt,
        error: "GROQ_API_KEY not set",
      };
    }

    // Process in batches.
    let classified = 0;
    let flagged    = 0;
    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      const verdicts = await classifyItems(batch);
      const now = new Date().toISOString();

      for (const item of batch) {
        const v = verdicts.get(item.id);
        if (!v) continue; // AI didn't return a verdict for this one — leave as-is
        await db
          .update(tasks)
          .set({
            classification:       v.verdict,
            classificationReason: v.reason || null,
            classifiedAt:         now,
            updatedAt:            now,
          })
          .where(eq(tasks.id, item.id));
        classified++;
        if (v.verdict === "info") flagged++;
      }
    }

    return {
      status: "success", courseId, courseName,
      itemsClassified: classified, itemsFlaggedInfo: flagged,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      status: "error", courseId, courseName: "(error)",
      itemsClassified: 0, itemsFlaggedInfo: 0,
      durationMs: Date.now() - startedAt,
      error: String(err),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// iCal (RFC 5545) parser
// ─────────────────────────────────────────────────────────────────────────

/**
 * Minimal iCal (RFC 5545) parser. Returns every VEVENT in the feed —
 * the caller filters by date if it wants a window. We keep it simple
 * and complete: line folding, common escape sequences, DATE vs
 * DATE-TIME, TZID passthrough.
 */
type IcalEvent = {
  uid:         string;
  summary:     string;
  start:       Date;
  end:         Date | null;
  allDay:      boolean;
  location:    string | null;
  description: string | null;
  categories:  string | null;
};

function parseIcal(text: string): IcalEvent[] {
  // Unfold lines: a line starting with space/tab continues the previous one.
  const raw   = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const lines = raw.split(/\r?\n/);

  const events: IcalEvent[] = [];
  let current: Partial<IcalEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { current = {}; continue; }
    if (line === "END:VEVENT") {
      if (current?.uid && current?.summary && current?.start) {
        events.push({
          uid:         current.uid,
          summary:     current.summary,
          start:       current.start,
          end:         current.end ?? null,
          allDay:      current.allDay ?? false,
          location:    current.location ?? null,
          description: current.description ?? null,
          categories:  current.categories ?? null,
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const name  = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const semi  = name.indexOf(";");
    const prop  = (semi < 0 ? name : name.slice(0, semi)).toUpperCase();

    switch (prop) {
      case "UID":         current.uid = unescapeIcal(value); break;
      case "SUMMARY":     current.summary = unescapeIcal(value); break;
      case "DTSTART":
        current.start  = parseIcalDate(value, name);
        current.allDay = /VALUE=DATE(?!-)/i.test(name);
        break;
      case "DTEND":       current.end = parseIcalDate(value, name); break;
      case "LOCATION":    current.location = unescapeIcal(value); break;
      case "DESCRIPTION": current.description = unescapeIcal(value); break;
      case "CATEGORIES":  current.categories = unescapeIcal(value); break;
    }
  }
  return events;
}

function unescapeIcal(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseIcalDate(value: string, fullName: string): Date {
  // DATE only: YYYYMMDD → start of day UTC
  if (/^\d{8}$/.test(value)) {
    return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00Z`);
  }
  // DATE-TIME with Z (UTC) or with TZID (floating, treated as server-local
  // — for EUR that means CET/CEST which is what the user's browser shows
  // anyway since most EUR machines run in CET).
  const m = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(9, 11)}:${value.slice(11, 13)}:${value.slice(13, 15)}`;
  if (value.endsWith("Z")) {
    return new Date(`${m}.000Z`);
  }
  return new Date(m); // server-local time
}
