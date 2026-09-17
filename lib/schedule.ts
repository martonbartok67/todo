/**
 * 📅 Schedule resolution — the engine behind "attach timetable deadlines".
 *
 * The old implementation hardcoded, per Canvas course id, a table of
 * "module N → ISO week NN" mappings transcribed by hand from each course
 * manual. It broke for three reasons:
 *
 *   1. It only looked at `timetable_events.course_canvas_id`, which is NULL
 *      for every iCal event whose SUMMARY doesn't contain the *exact*
 *      Canvas `course_code` string. MyTimetable writes "BT1201 - Intro to
 *      Business"; Canvas stores "BT1201_2025_2". No match → no course id →
 *      no event found → "couldn't find a matching event" for every task.
 *   2. The ISO-week window was computed against a hardcoded `year = 2026`.
 *   3. Any course not in the hand-written table could never be matched.
 *
 * This module replaces all of that with something derived from the data we
 * already have: **the calendar itself defines the course's teaching weeks.**
 *
 * Group a course's calendar events by ISO week, drop exam-only weeks, sort
 * ascending — that ordered list *is* "module 1, module 2, module 3…". The
 * week-42/43 exam gap disappears for free because those weeks hold no
 * teaching events, and it keeps working next academic year with no edits.
 *
 * Everything here is pure and side-effect free so it can be unit-tested
 * and reused by both the server action and the sync pipeline.
 */

import type { TimetableEvent } from "@/drizzle/schema";

// ─────────────────────────────────────────────────────────────────────────
// ISO week arithmetic, in the university's timezone
// ─────────────────────────────────────────────────────────────────────────

/**
 * All week arithmetic happens in Europe/Amsterdam, not UTC. A lecture at
 * 09:00 Amsterdam is 07:00Z — same day either way — but a Monday 00:30
 * event is Sunday in UTC, which would put it in the *previous* ISO week.
 * Anchoring on the campus timezone keeps weeks aligned with what the
 * student sees on their timetable.
 */
export const CAMPUS_TZ = "Europe/Amsterdam";

const CIVIL_DATE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: CAMPUS_TZ,
  year:  "numeric",
  month: "2-digit",
  day:   "2-digit",
});

/** The calendar date an instant falls on in Europe/Amsterdam. */
function civilDate(d: Date): { y: number; m: number; day: number } {
  // en-CA gives "YYYY-MM-DD", which is stable to split.
  const [y, m, day] = CIVIL_DATE_FMT.format(d).split("-").map(Number);
  return { y, m, day };
}

/**
 * "YYYY-MM-DD" of an instant, campus-local. Use this — not
 * `date.toISOString().slice(0, 10)` — for any "which day is this" grouping
 * key (e.g. an agenda's day headers). ISO-slicing reads the UTC date, so
 * for a viewer in Amsterdam it mislabels everything from midnight to 2am
 * (summer) or 1am (winter) as still being the previous day.
 */
export function campusDateKey(d: Date): string {
  return CIVIL_DATE_FMT.format(d);
}

export type IsoWeek = { year: number; week: number };

/** ISO-8601 week (and ISO week-year) of an instant, campus-local. */
export function isoWeekOf(date: Date): IsoWeek {
  const { y, m, day } = civilDate(date);
  // Shift to the Thursday of this week — its calendar year is the ISO year.
  const d = new Date(Date.UTC(y, m - 1, day));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((d.getTime() - jan1) / 86_400_000 + 1) / 7);
  return { year, week };
}

/** Stable map key for an ISO week, e.g. "2026-W38". */
export function isoWeekKey(w: IsoWeek): string {
  return `${w.year}-W${String(w.week).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Course ↔ calendar-event matching
// ─────────────────────────────────────────────────────────────────────────

/**
 * A course code as it appears in the wild: two-to-five letters, an optional
 * separator, then three-to-five digits. "BT1201", "BT 1201", "BT-1201".
 *
 * The trailing `(?!\d)` (rather than `\b`) is deliberate: `\b` fails on
 * "BT1201_2025" because `_` is a word character, which is exactly the shape
 * Canvas uses for course codes.
 */
const COURSE_CODE_RE  = /(^|[^A-Za-z0-9])([A-Za-z]{2,5})[\s._-]?(\d{3,5})(?!\d)/;
const COURSE_CODE_RE_G = new RegExp(COURSE_CODE_RE.source, "g");

/** Normalise any string containing a course code to a canonical key. */
export function courseCodeKey(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(COURSE_CODE_RE);
  return m ? `${m[2]}${m[3]}`.toUpperCase() : null;
}

/** Every course-code-shaped token in a blob of text, canonicalised. */
export function extractCourseCodeKeys(s: string | null | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  for (const m of s.matchAll(COURSE_CODE_RE_G)) {
    out.push(`${m[2]}${m[3]}`.toUpperCase());
  }
  return out;
}

const NAME_STOPWORDS = new Set([
  "the", "and", "for", "with", "introduction", "intro", "to", "of", "in",
  "an", "a", "i", "ii", "iii", "iv", "course", "bsc", "msc", "iba", "rsm",
  "bachelor", "year", "semester", "block", "part", "study", "studies",
]);

/** Significant lowercase word tokens of a course name, for fuzzy matching. */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !NAME_STOPWORDS.has(w));
}

export type CourseRef = {
  canvasId:   string;
  name:       string;
  courseCode: string | null;
};

type CourseIndex = {
  byCode:   Map<string, CourseRef>;
  byTokens: { course: CourseRef; tokens: Set<string> }[];
};

/** Build a lookup index once, then match many events against it. */
export function buildCourseIndex(courses: CourseRef[]): CourseIndex {
  const byCode = new Map<string, CourseRef>();
  const byTokens: CourseIndex["byTokens"] = [];

  for (const c of courses) {
    // A code may live in `course_code` ("BT1201_2025_2") or, for sloppily
    // configured courses, only in the name ("BT1201 Intro to Business").
    const key = courseCodeKey(c.courseCode) ?? courseCodeKey(c.name);
    if (key && !byCode.has(key)) byCode.set(key, c);

    const tokens = new Set(nameTokens(c.name));
    if (tokens.size) byTokens.push({ course: c, tokens });
  }

  return { byCode, byTokens };
}

/**
 * Work out which course a calendar event belongs to.
 *
 * Tried in order of confidence:
 *   1. A known course code anywhere in CATEGORIES / SUMMARY / DESCRIPTION /
 *      LOCATION — normalised, so "BT1201 - Intro" matches "BT1201_2025_2".
 *   2. Two or more significant course-name words in the event title, or one
 *      distinctive word when the course name is a single word.
 *
 * Returns null rather than guessing when neither is convincing — a wrong
 * link would silently attach deadlines to the wrong lectures.
 */
export function matchEventToCourse(
  index: CourseIndex,
  event: { title: string; description?: string | null; location?: string | null; categories?: string | null },
): CourseRef | null {
  const haystacks = [event.categories, event.title, event.description, event.location];

  for (const h of haystacks) {
    for (const key of extractCourseCodeKeys(h)) {
      const hit = index.byCode.get(key);
      if (hit) return hit;
    }
  }

  const titleTokens = new Set(nameTokens(event.title ?? ""));
  if (titleTokens.size) {
    let best: { course: CourseRef; score: number } | null = null;
    for (const { course, tokens } of index.byTokens) {
      let score = 0;
      for (const t of tokens) if (titleTokens.has(t)) score++;
      const needed = Math.min(2, tokens.size);
      if (score >= needed && (!best || score > best.score)) best = { course, score };
    }
    if (best) return best.course;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Event kinds
// ─────────────────────────────────────────────────────────────────────────

export type EventKind = "lecture" | "workshop" | "exam" | "other";

const EXAM_RE     = /\b(exam|tentamen|resit|retake|midterm|final\s*test|hertentamen)\b/i;
const WORKSHOP_RE = /\b(workshop|tutorial|seminar|practical|practicum|werkgroep|lab|session|instruction)\b/i;
const LECTURE_RE  = /\b(lecture|hoorcollege|college|class|plenary)\b/i;

/** Classify a calendar event from its title/description. */
export function eventKind(e: { title: string; description?: string | null }): EventKind {
  const t = `${e.title} ${e.description ?? ""}`;
  if (EXAM_RE.test(t))     return "exam";
  if (WORKSHOP_RE.test(t)) return "workshop";
  if (LECTURE_RE.test(t))  return "lecture";
  return "other";
}

/** Which kind of event a piece of coursework should hang off. */
export function preferredKindFor(text: string): EventKind {
  if (WORKSHOP_RE.test(text)) return "workshop";
  return "lecture";
}

// ─────────────────────────────────────────────────────────────────────────
// Teaching weeks
// ─────────────────────────────────────────────────────────────────────────

export type TeachingWeek = {
  key:    string;          // "2026-W38"
  year:   number;
  week:   number;          // ISO week number
  start:  string;          // ISO timestamp of the first event that week
  events: TimetableEvent[]; // ascending by startAt
};

/**
 * Turn a course's raw calendar events into its ordered teaching weeks.
 *
 * Weeks containing *only* exams are dropped: at EUR the exam fortnight sits
 * between the two teaching blocks, and counting it would shift every module
 * after it by one. This is what the old hardcoded `{7: 44, 8: 45, …}` table
 * was compensating for by hand.
 */
export function buildTeachingWeeks(events: TimetableEvent[]): TeachingWeek[] {
  const byWeek = new Map<string, TeachingWeek>();

  for (const e of events) {
    const at = new Date(e.startAt);
    if (Number.isNaN(at.getTime())) continue;
    const iso = isoWeekOf(at);
    const key = isoWeekKey(iso);
    let bucket = byWeek.get(key);
    if (!bucket) {
      bucket = { key, year: iso.year, week: iso.week, start: e.startAt, events: [] };
      byWeek.set(key, bucket);
    }
    bucket.events.push(e);
  }

  const weeks = Array.from(byWeek.values());
  for (const w of weeks) {
    w.events.sort((a, b) => a.startAt.localeCompare(b.startAt));
    w.start = w.events[0]!.startAt;
  }
  weeks.sort((a, b) => a.start.localeCompare(b.start));

  return weeks.filter((w) => !w.events.every((e) => eventKind(e) === "exam"));
}

export type CourseSchedule = {
  courseCanvasId: string;
  weeks:          TeachingWeek[];      // ordinal order: weeks[0] === "module 1"
  byIsoWeek:      Map<number, TeachingWeek>; // ISO week number → week
};

export function buildCourseSchedule(
  courseCanvasId: string,
  events: TimetableEvent[],
  /**
   * The instant an ambiguous ISO week number ("wk38") resolves relative
   * to. Calendar data isn't pruned on delete — a course's stored events
   * can span more than one academic year — so the same week number can
   * legitimately occur twice (this September's wk38 and last September's).
   * "First occurrence wins" silently preferred whichever was chronologically
   * earliest, which is *always* the stale one. Preferring whichever
   * occurrence is closest to now is the one rule that stays correct as
   * the current date moves through the year, without needing to model
   * "the current academic year" explicitly. Callers should also window
   * their query to roughly the current academic year (see
   * app/actions/timetable.ts's loadSchedules) — that's the primary
   * defense; this is what handles whatever survives the window.
   */
  referenceDate: Date = new Date(),
): CourseSchedule {
  const weeks = buildTeachingWeeks(events);
  const refMs = referenceDate.getTime();
  const byIsoWeek = new Map<number, TeachingWeek>();
  for (const w of weeks) {
    const existing = byIsoWeek.get(w.week);
    if (!existing) { byIsoWeek.set(w.week, w); continue; }
    const existingDist = Math.abs(new Date(existing.start).getTime() - refMs);
    const candidateDist = Math.abs(new Date(w.start).getTime() - refMs);
    if (candidateDist < existingDist) byIsoWeek.set(w.week, w);
  }
  return { courseCanvasId, weeks, byIsoWeek };
}

// ─────────────────────────────────────────────────────────────────────────
// Week references in coursework titles
// ─────────────────────────────────────────────────────────────────────────

/**
 * A week mentioned by a task/reading title.
 *  - `iso`     — an absolute ISO week number ("wk38", "week 38")
 *  - `ordinal` — the Nth teaching week of the course ("Module 3", "Unit 3.1")
 */
export type WeekRef =
  | { kind: "iso";     week: number; token: string }
  | { kind: "ordinal"; n: number;    token: string };

/** ISO weeks in an academic calendar are always ≥ this; below it, it's an ordinal. */
const ISO_WEEK_FLOOR = 20;

/**
 * Pull every plausible week reference out of a title/description, most
 * specific first. Ambiguous numbers ("Week 3") yield an ISO candidate *and*
 * an ordinal candidate; `resolveWeekRef` picks whichever the course's real
 * calendar supports.
 */
export function extractWeekRefs(text: string): WeekRef[] {
  const refs: WeekRef[] = [];
  const push = (r: WeekRef) => {
    if (!refs.some((x) => x.kind === r.kind && JSON.stringify(x) === JSON.stringify(r))) refs.push(r);
  };

  // "wk38", "wk 38", "(wk38)" — the EUR convention for absolute ISO weeks.
  for (const m of text.matchAll(/\bwk[\s._-]?(\d{1,2})\b/gi)) {
    const n = parseInt(m[1], 10);
    if (n >= ISO_WEEK_FLOOR) push({ kind: "iso", week: n, token: m[0] });
    else push({ kind: "ordinal", n, token: m[0] });
  }

  // "Week 38" / "Week 3" — ambiguous, so emit both readings.
  for (const m of text.matchAll(/\bweeks?[\s._-]?(\d{1,2})\b/gi)) {
    const n = parseInt(m[1], 10);
    if (n >= ISO_WEEK_FLOOR) push({ kind: "iso", week: n, token: m[0] });
    if (n >= 1 && n <= 30)   push({ kind: "ordinal", n, token: m[0] });
  }

  // "Module 3", "Unit 3", "Lecture 3", "Session 3", "Topic 3", "Class 3"
  for (const m of text.matchAll(/\b(?:module|unit|lecture|session|topic|class|chapter|part)[\s._-]?(\d{1,2})\b/gi)) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 30) push({ kind: "ordinal", n, token: m[0] });
  }

  // Leading "3.1 — Elasticity" / "Unit 3.2": the major number is the module.
  for (const m of text.matchAll(/(^|[^\d.])(\d{1,2})\.(\d{1,2})(?!\d)/g)) {
    const n = parseInt(m[2], 10);
    if (n >= 1 && n <= 30) push({ kind: "ordinal", n, token: `${m[2]}.${m[3]}` });
  }

  return refs;
}

export type WeekResolution = {
  week: TeachingWeek;
  ref:  WeekRef;
};

/**
 * Resolve the first week reference the course's calendar can actually
 * satisfy. An ISO reference must name a week the course really teaches; an
 * ordinal must fall within the number of teaching weeks it has. Anything
 * else is rejected rather than approximated.
 */
export function resolveWeekRef(
  schedule: CourseSchedule,
  refs: WeekRef[],
): WeekResolution | null {
  for (const ref of refs) {
    if (ref.kind === "iso") {
      const w = schedule.byIsoWeek.get(ref.week);
      if (w) return { week: w, ref };
    } else {
      const w = schedule.weeks[ref.n - 1];
      if (w) return { week: w, ref };
    }
  }
  return null;
}

/**
 * Pick the single event in a week that a piece of coursework is due against.
 * Prefers the requested kind (a workshop task → the workshop), then any
 * lecture, then any non-exam event, then whatever is first.
 */
export function pickEventInWeek(
  week: TeachingWeek,
  prefer: EventKind,
): TimetableEvent {
  const of = (k: EventKind) => week.events.find((e) => eventKind(e) === k);
  return (
    of(prefer) ??
    of("lecture") ??
    week.events.find((e) => eventKind(e) !== "exam") ??
    week.events[0]!
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Wall-clock → instant conversion
// ─────────────────────────────────────────────────────────────────────────

/** Milliseconds a timezone is ahead of UTC at a given instant. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));

  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
  // hourCycle quirks can render midnight as "24"; normalise it.
  const asIfUtc = Date.UTC(
    get("year"), get("month") - 1, get("day"),
    get("hour") % 24, get("minute"), get("second"),
  );
  return asIfUtc - utcMs;
}

/**
 * Interpret a wall-clock time in a named timezone and return the instant.
 *
 * iCal DTSTART values are usually *floating* or carry a TZID; the previous
 * code handed them to `new Date(...)`, which reads them in the *server's*
 * timezone — UTC on Vercel. A 09:00 Amsterdam lecture was therefore stored
 * as 09:00Z and rendered as 11:00 to the student, and every derived
 * deadline inherited the same one-to-two hour drift.
 *
 * The offset is applied twice so times near a DST transition land on the
 * correct side of the jump.
 */
export function zonedWallTimeToUtc(
  y: number, month: number, day: number,
  h = 0, min = 0, s = 0,
  tz: string = CAMPUS_TZ,
): Date {
  const naive  = Date.UTC(y, month - 1, day, h, min, s);
  const pass1  = naive - tzOffsetMs(naive, tz);
  const pass2  = naive - tzOffsetMs(pass1, tz);
  return new Date(pass2);
}
