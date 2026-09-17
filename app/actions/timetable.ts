"use server";
/**
 * ⏰ Timetable server actions.
 *
 * `attachTimetableDeadlines()` gives every undated piece of coursework a
 * deadline derived from the lecture or workshop it belongs to.
 *
 * How the link is made — the part that used to be broken:
 *
 *   task title ──"Module 3"/"wk38"/"Unit 3.1"──▶ week reference
 *        │
 *        ▼
 *   the course's own calendar, grouped into teaching weeks
 *        │
 *        ▼
 *   the lecture (or workshop) in that week ──▶ due 1h before it starts
 *
 * The week→date table is no longer hand-transcribed per course: the
 * calendar *is* the table. See lib/schedule.ts for the reasoning.
 *
 * Before any of that runs we repair the calendar itself — iCal events whose
 * course could not be identified at ingest are re-matched here, because an
 * event with a NULL course_canvas_id can never be found by a course-scoped
 * lookup, which is why every task previously came back "couldn't find a
 * matching event".
 */
import { db } from "@/lib/db";
import {
  tasks, timetableEvents, userSettings, readingItems, courses,
} from "@/drizzle/schema";
import type { TimetableEvent } from "@/drizzle/schema";
import { eq, isNull, and, or, not } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import {
  buildCourseIndex, buildCourseSchedule, matchEventToCourse,
  extractWeekRefs, resolveWeekRef, pickEventInWeek, preferredKindFor,
  type CourseSchedule,
} from "@/lib/schedule";

/** Coursework is due this long before the session it belongs to. */
const DUE_BEFORE_EVENT_MS = 60 * 60 * 1000;

/**
 * Remedial quizzes are the one item that follows its lecture rather than
 * preceding it — the student sits it after the material is covered.
 */
const REMEDIAL_RE = /remedial\s*quiz/i;
const REMEDIAL_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

/** How many failures to name in the UI before we stop listing them. */
const MAX_REPORTED_FAILURES = 12;

export type AttachFailure = {
  title:  string;
  course: string;
  reason: string;
};

export type AttachResult = {
  /** Undated (or previously timetable-dated) tasks we looked at. */
  considered:     number;
  /** Tasks that now have a deadline derived from a calendar event. */
  matched:        number;
  /** Of those, ones whose existing derived date was corrected. */
  corrected:      number;
  /** Nothing in the title said which week it belongs to. */
  noWeekRef:      number;
  /** The course has no calendar events at all — nothing to match against. */
  noCourseEvents: number;
  /** A week was named, but that week holds no session for this course. */
  noEventForWeek: number;
  /** Calendar events repaired with a course id by the pre-pass. */
  relinkedEvents: number;
  /** Reading-list rows given a concrete lecture date. */
  readingsDated:  number;
  failures:       AttachFailure[];
};

/**
 * Pre-pass: give every orphaned calendar event a course.
 *
 * MyTimetable writes "BT1201 - Introduction to Business" while Canvas
 * stores the code as "BT1201_2025_2", so the old exact-string match failed
 * and left course_canvas_id NULL. matchEventToCourse() normalises both
 * sides, and falls back to course-name words when no code is present.
 */
async function relinkOrphanedEvents(): Promise<number> {
  const knownCourses = await db
    .select({ canvasId: courses.canvasId, name: courses.name, courseCode: courses.courseCode })
    .from(courses);
  if (!knownCourses.length) return 0;

  const index   = buildCourseIndex(knownCourses);
  const orphans = await db.select().from(timetableEvents)
    .where(isNull(timetableEvents.courseCanvasId));

  let relinked = 0;
  const now = new Date().toISOString();

  for (const e of orphans) {
    const hit = matchEventToCourse(index, {
      title:       e.title,
      description: e.description,
      location:    e.location,
    });
    if (!hit) continue;
    await db.update(timetableEvents)
      .set({ courseCanvasId: hit.canvasId, courseName: hit.name, updatedAt: now })
      .where(eq(timetableEvents.id, e.id));
    relinked++;
  }
  return relinked;
}

/** One CourseSchedule per course that has any calendar events. */
async function loadSchedules(): Promise<Map<string, CourseSchedule>> {
  const all = await db.select().from(timetableEvents)
    .where(not(isNull(timetableEvents.courseCanvasId)));

  const byCourse = new Map<string, TimetableEvent[]>();
  for (const e of all) {
    if (!e.courseCanvasId) continue;
    const list = byCourse.get(e.courseCanvasId);
    if (list) list.push(e);
    else byCourse.set(e.courseCanvasId, [e]);
  }

  const out = new Map<string, CourseSchedule>();
  for (const [courseId, events] of byCourse) {
    out.set(courseId, buildCourseSchedule(courseId, events));
  }
  return out;
}

// ── Main action ────────────────────────────────────────────────────────────

export async function attachTimetableDeadlines(): Promise<AttachResult> {
  const result: AttachResult = {
    considered: 0, matched: 0, corrected: 0,
    noWeekRef: 0, noCourseEvents: 0, noEventForWeek: 0,
    relinkedEvents: 0, readingsDated: 0, failures: [],
  };

  result.relinkedEvents = await relinkOrphanedEvents();
  const schedules = await loadSchedules();

  const courseNames = new Map<string, string>();
  for (const c of await db.select({ id: courses.canvasId, name: courses.name }).from(courses)) {
    courseNames.set(c.id, c.name);
  }

  const note = (title: string, courseId: string, reason: string) => {
    if (result.failures.length < MAX_REPORTED_FAILURES) {
      result.failures.push({ title, course: courseNames.get(courseId) ?? courseId, reason });
    }
  };

  // Tasks with no date at all, plus ones we dated ourselves last time —
  // re-deriving those is how a corrected or re-published timetable
  // propagates. A real Canvas deadline is never touched.
  const candidates = await db.select().from(tasks).where(
    and(
      isNull(tasks.completedAt),
      or(isNull(tasks.dueAt), eq(tasks.deadlineSource, "timetable")),
    ),
  );
  result.considered = candidates.length;

  const now = new Date().toISOString();

  for (const task of candidates) {
    const schedule = schedules.get(task.courseCanvasId);
    if (!schedule || schedule.weeks.length === 0) {
      result.noCourseEvents++;
      note(task.title, task.courseCanvasId, "no calendar events for this course");
      continue;
    }

    const searchText = [task.title, task.itemType ?? "", task.description ?? ""].join(" ");
    const refs = extractWeekRefs(searchText);
    if (refs.length === 0) {
      result.noWeekRef++;
      note(task.title, task.courseCanvasId, "no week or module number in the title");
      continue;
    }

    const resolved = resolveWeekRef(schedule, refs);
    if (!resolved) {
      result.noEventForWeek++;
      note(task.title, task.courseCanvasId, `week "${refs[0].token}" has no session on the calendar`);
      continue;
    }

    const event = pickEventInWeek(resolved.week, preferredKindFor(searchText));
    const start = new Date(event.startAt).getTime();
    const dueMs = REMEDIAL_RE.test(task.title)
      ? start + REMEDIAL_GRACE_MS
      : start - DUE_BEFORE_EVENT_MS;
    const dueAt = new Date(dueMs).toISOString();

    if (task.dueAt === dueAt && task.linkedEventId === event.id) {
      result.matched++;   // already correct; no write needed
      continue;
    }
    if (task.dueAt && task.dueAt !== dueAt) result.corrected++;

    await db.update(tasks)
      .set({
        dueAt,
        deadlineSource: "timetable",
        linkedEventId:  event.id,
        updatedAt:      now,
      })
      .where(eq(tasks.id, task.id));
    result.matched++;
  }

  // ── Reading list: same resolution, but the date is the lecture itself ──
  const readings = await db.select().from(readingItems);

  for (const r of readings) {
    const schedule = schedules.get(r.courseCanvasId);
    if (!schedule || schedule.weeks.length === 0) continue;

    // An explicit week_number from the syllabus extractor wins; otherwise
    // read the week out of the lecture label ("Week 3", "Lecture 5").
    const refs = r.weekNumber
      ? [{ kind: "iso" as const, week: r.weekNumber, token: `week ${r.weekNumber}` },
         { kind: "ordinal" as const, n: r.weekNumber, token: `week ${r.weekNumber}` }]
      : extractWeekRefs(`${r.lectureLabel} ${r.readingText}`);
    if (refs.length === 0) continue;

    const resolved = resolveWeekRef(schedule, refs);
    if (!resolved) continue;

    const event = pickEventInWeek(resolved.week, "lecture");
    if (r.lectureDate === event.startAt && r.linkedTimetableEventId === event.id) continue;

    await db.update(readingItems)
      .set({
        lectureDate:            event.startAt,
        linkedTimetableEventId: event.id,
        deadlineConfidence:     resolved.ref.kind === "iso" ? 0.9 : 0.75,
        updatedAt:              now,
      })
      .where(eq(readingItems.id, r.id));
    result.readingsDated++;
  }

  revalidatePath("/");
  revalidatePath("/readings");
  revalidatePath("/timetable");
  return result;
}

// ── iCal settings ─────────────────────────────────────────────────────────

export async function saveIcalUrl(url: string, label: string | null) {
  const trimmed = (url ?? "").trim().replace(/\s+/g, "");
  if (!trimmed) return { status: "error" as const, error: "URL is required" };
  const now = new Date().toISOString();
  await db.insert(userSettings)
    .values({ id: 1, icalUrl: trimmed, icalLabel: label || "My Timetable", createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: userSettings.id, set: { icalUrl: trimmed, icalLabel: label || "My Timetable", updatedAt: now } });
  revalidatePath("/timetable");
  revalidatePath("/settings");
  return { status: "ok" as const, synced: 0 };
}

export async function clearIcalUrl() {
  const now = new Date().toISOString();
  await db.update(userSettings)
    .set({ icalUrl: null, icalLabel: null, updatedAt: now })
    .where(eq(userSettings.id, 1));
  revalidatePath("/timetable");
  revalidatePath("/settings");
  return { ok: true };
}
