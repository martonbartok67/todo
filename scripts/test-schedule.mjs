/**
 * Regression tests for lib/schedule.ts — the module that decides which
 * lecture a piece of coursework is due against.
 *
 *   npm run test:schedule
 *
 * There is no test runner in this project, so this compiles the one module
 * under test with `tsc` into a temp dir and asserts against it. Keeping it
 * dependency-free means it runs in CI, in a container, and on a laptop with
 * nothing installed but the project's own devDependencies.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const out  = mkdtempSync(join(tmpdir(), "schedule-test-"));

const tsconfig = join(out, "tsconfig.json");
writeFileSync(tsconfig, JSON.stringify({
  compilerOptions: {
    target: "es2020", module: "es2020", moduleResolution: "node",
    lib: ["es2020"], strict: false, skipLibCheck: true,
    outDir: out, rootDir: root, baseUrl: root, paths: { "@/*": ["./*"] },
  },
  files: [join(root, "lib/schedule.ts")],
}));

execFileSync("npx", ["tsc", "-p", tsconfig], { stdio: "inherit" });
const S = await import(pathToFileURL(join(out, "lib/schedule.js")).href);

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else {
    fail++;
    console.log(`FAIL   ${label}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`);
  }
};

// ── ISO weeks, anchored to the campus timezone ─────────────────────────
eq("ISO week of 2026-09-17", S.isoWeekOf(new Date("2026-09-17T09:00:00Z")), { year: 2026, week: 38 });
eq("ISO week of 2026-08-31", S.isoWeekOf(new Date("2026-08-31T07:00:00Z")), { year: 2026, week: 36 });
// 22:30Z Sunday is 00:30 Monday in Amsterdam — it belongs to the new week.
eq("Mon 00:30 CEST is the new week", S.isoWeekOf(new Date("2026-09-20T22:30:00Z")), { year: 2026, week: 39 });

// ── Course codes: the mismatch that left every iCal event unlinked ─────
eq("Canvas code with year suffix", S.courseCodeKey("BT1201_2025_2"), "BT1201");
eq("MyTimetable summary code",     S.courseCodeKey("BT1201 - Introduction to Business"), "BT1201");
eq("hyphenated code",              S.courseCodeKey("BT-1304 Mathematics"), "BT1304");
eq("no code present",              S.courseCodeKey("Introduction to Business"), null);

const courses = [
  { canvasId: "57918", name: "Introduction to Business", courseCode: "BT1201_2025_2" },
  { canvasId: "57916", name: "Organisational Behaviour", courseCode: "BT1202-25" },
  { canvasId: "57923", name: "Mathematics",              courseCode: "BT1304" },
  { canvasId: "42446", name: "IBA Notice Board",         courseCode: null },
];
const idx = S.buildCourseIndex(courses);

eq("SUMMARY code → course",  S.matchEventToCourse(idx, { title: "BT1201 - Introduction to Business (Lecture)" })?.canvasId, "57918");
eq("CATEGORIES code → course", S.matchEventToCourse(idx, { title: "Lecture", categories: "Course, BT1202" })?.canvasId, "57916");
eq("course-name fallback",   S.matchEventToCourse(idx, { title: "Organisational Behaviour workshop" })?.canvasId, "57916");
eq("unrelated event stays unmatched", S.matchEventToCourse(idx, { title: "Dentist appointment" }), null);

// ── Teaching weeks from a real-shaped calendar ─────────────────────────
// Block 1 = ISO wk36-41, exam fortnight wk42-43, block 2 = wk44-49.
let id = 0;
const ev = (startAt, title) => ({ id: ++id, title, description: null, startAt, endAt: null });
const mondayOf = (w) => new Date(Date.UTC(2026, 7, 31) + (w - 36) * 7 * 86_400_000);

const events = [];
for (const w of [36, 37, 38, 39, 40, 41, 44, 45, 46, 47, 48, 49]) {
  const mon = mondayOf(w).getTime();
  events.push(ev(new Date(mon + 9 * 3_600_000).toISOString(), `BT1201 Lecture (wk${w})`));
  events.push(ev(new Date(mon + 3 * 86_400_000 + 13 * 3_600_000).toISOString(), `BT1201 Workshop (wk${w})`));
}
for (const w of [42, 43]) {
  events.push(ev(new Date(mondayOf(w).getTime() + 9 * 3_600_000).toISOString(), "BT1201 Exam"));
}

const sched = S.buildCourseSchedule("57918", events);
eq("exam fortnight is not a teaching week", sched.weeks.length, 12);
eq("teaching weeks in order", sched.weeks.map((w) => w.week), [36,37,38,39,40,41,44,45,46,47,48,49]);

const resolve = (title) => {
  const r = S.resolveWeekRef(sched, S.extractWeekRefs(title));
  if (!r) return null;
  return { week: r.week.week, kind: S.eventKind(S.pickEventInWeek(r.week, S.preferredKindFor(title))) };
};

// The case the old hardcoded {7:44, 8:45, …} table was written to handle.
eq('"Module 7" skips the exam gap',   resolve("Module 7 quiz"),          { week: 44, kind: "lecture" });
eq('"Module 1" → first teaching week', resolve("Module 1 reading"),      { week: 36, kind: "lecture" });
eq('"Module 12" → last teaching week', resolve("Module 12 recap"),       { week: 49, kind: "lecture" });
eq('"(wk38)" is an absolute ISO week', resolve("Assignment (wk38)"),     { week: 38, kind: "lecture" });
eq('"Unit 3.1" → 3rd teaching week',   resolve("Unit 3.1 Elasticity"),   { week: 38, kind: "lecture" });
eq("workshop task picks the workshop", resolve("Module 4 workshop prep"),{ week: 39, kind: "workshop" });
eq('"Week 38" reads as ISO',           resolve("Week 38 material"),      { week: 38, kind: "lecture" });
eq('"Week 3" reads as ordinal',        resolve("Week 3 material"),       { week: 38, kind: "lecture" });
eq("module past the end → no match",   resolve("Module 20 bonus"),       null);
eq("no week reference → no match",     resolve("Course introduction"),   null);

// ── Year-boundary ambiguity: same ISO week, two academic years ────────
// Calendar rows are never deleted on re-sync, so a course's stored events
// can span more than one September. "First occurrence wins" always picked
// the stale year; resolution should prefer whichever occurrence is closest
// to "now".
{
  const thisYearWk38 = ev(new Date(Date.UTC(2026, 8, 14, 9, 0, 0)).toISOString(), "BT1201 Lecture (wk38)");
  const lastYearWk38 = ev(new Date(Date.UTC(2025, 8, 15, 9, 0, 0)).toISOString(), "BT1201 Lecture (wk38)");
  const spanning = S.buildCourseSchedule("57918", [lastYearWk38, thisYearWk38], new Date("2026-09-17T12:00:00Z"));
  const nearest  = S.resolveWeekRef(spanning, S.extractWeekRefs("(wk38)"));
  eq("ambiguous wk38 resolves to the occurrence nearest today",
     nearest?.week.start, thisYearWk38.startAt);
}

// ── Wall-clock → instant, across the DST boundary ─────────────────────
eq("09:00 Amsterdam in summer is 07:00Z", S.zonedWallTimeToUtc(2026, 9, 17, 9, 0, 0).toISOString(), "2026-09-17T07:00:00.000Z");
eq("09:00 Amsterdam in winter is 08:00Z", S.zonedWallTimeToUtc(2026, 12, 3, 9, 0, 0).toISOString(), "2026-12-03T08:00:00.000Z");

rmSync(out, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
