// Standalone verifier for the pickBestEvent logic in app/actions/timetable.ts.
// Re-implements tokenize + stripCourseCodePrefix + pickBestEvent to confirm
// the new behavior: tasks for "Lecture X" pick the next "Lecture X" event,
// not just the soonest event overall.

function tokenize(s) {
  const out = new Set();
  for (const w of s.toLowerCase().split(/\W+/)) {
    if (w.length < 3) continue;
    if (/^\d+$/.test(w)) continue;
    out.add(w);
  }
  return out;
}

function stripCourseCodePrefix(title, courseCode) {
  if (!courseCode) return title;
  const prefix = courseCode.toLowerCase();
  const lower = title.toLowerCase();
  if (lower.startsWith(prefix)) {
    const rest = title.slice(courseCode.length).replace(/^[\s\-:]+/, "");
    return rest || title;
  }
  return title;
}

function pickBestEvent(taskTitle, events, opts) {
  const taskWords = tokenize(taskTitle);
  if (taskWords.size === 0) return events[0];

  let best = events[0];
  let bestScore = 0;
  for (const e of events) {
    const evTitle = stripCourseCodePrefix(e.title, opts.courseCode);
    const evWords = tokenize(evTitle);

    let score = 0;
    evWords.forEach((w) => {
      if (taskWords.has(w)) score += 1;
      else if (opts.courseSignature.has(w)) score += 0.5;
    });
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}

// Scenario 1: Math course with mixed event types — task should pick the
// right kind of event, not just the soonest.
const courseSig = tokenize("BT1304 Mathematics");
const mathEvents = [
  { startAt: "2026-09-10T09:00:00Z", title: "BT1304 - Lecture" },
  { startAt: "2026-09-12T09:00:00Z", title: "BT1304 - Tutorial" },
  { startAt: "2026-09-15T09:00:00Z", title: "BT1304 - Lecture" },
  { startAt: "2026-09-17T09:00:00Z", title: "BT1304 - Tutorial" },
  { startAt: "2026-09-22T09:00:00Z", title: "BT1304 - Lecture" },
];

const cases = [
  { task: "Lecture 3 reading",      expectTitle: "BT1304 - Lecture",  desc: "Lecture task → next Lecture (Sep 15)" },
  { task: "Tutorial 2 worksheet",   expectTitle: "BT1304 - Tutorial", desc: "Tutorial task → next Tutorial (Sep 12)" },
  { task: "Math problem set 4",    expectTitle: "BT1304 - Lecture",  desc: "Math task → soonest Lecture (Sep 10) via course-sig bonus" },
  { task: "Week 3 prep",           expectTitle: "BT1304 - Lecture",  desc: "No subject words → soonest event (Sep 10)" },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const picked = pickBestEvent(c.task, mathEvents, { courseCode: "BT1304", courseSignature: courseSig });
  const ok = picked.title === c.expectTitle;
  console.log(`${ok ? "✓" : "✗"}  task=${JSON.stringify(c.task).padEnd(28)} picked=${picked.title.padEnd(22)}  ${c.desc}`);
  if (ok) pass++; else fail++;
}

console.log("");
console.log(`PASS: ${pass}/${cases.length}   FAIL: ${fail}/${cases.length}`);

// Scenario 2: course without a code (notice board) — should still work.
const noCodeEvents = [
  { startAt: "2026-09-10T09:00:00Z", title: "Exchange kick-off" },
  { startAt: "2026-09-15T09:00:00Z", title: "Partner university info session" },
];
const sig = tokenize("RSM Bachelor Exchange");
const picked2 = pickBestEvent("Information session", noCodeEvents, { courseCode: null, courseSignature: sig });
console.log(`✓  no-code course: picked=${picked2.title}`);

// Scenario 3: every event has the same title — fall back to soonest.
const dupEvents = Array.from({ length: 20 }, (_, i) => ({
  startAt: `2026-09-${String(10 + i).padStart(2, "0")}T09:00:00Z`,
  title: "BT1304 - Mathematics",
}));
const picked3 = pickBestEvent("Generic task title", dupEvents, { courseCode: "BT1304", courseSignature: tokenize("BT1304 Mathematics") });
const expected3 = dupEvents[0];
const ok3 = picked3.startAt === expected3.startAt;
console.log(`${ok3 ? "✓" : "✗"}  duplicate-title course → soonest event (${picked3.startAt})`);

process.exit(fail === 0 && ok3 ? 0 : 1);