/**
 * Regression tests for lib/unit-rollup.ts — the rule that folds a unit's
 * clips, slides and recordings into the unit row itself.
 *
 *   npm run test:rollup
 *
 * Same shape as scripts/test-schedule.mjs: no test runner in this project,
 * so the one module under test is compiled with `tsc` into a temp dir and
 * asserted against directly.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const out  = mkdtempSync(join(tmpdir(), "rollup-test-"));

const tsconfig = join(out, "tsconfig.json");
writeFileSync(tsconfig, JSON.stringify({
  // lib/unit-rollup.ts imports nothing, so no module resolution, no path
  // aliases and no lib typings are needed — which also keeps this config
  // clear of options newer tsc releases have started deprecating.
  compilerOptions: {
    target: "es2020", module: "es2020",
    lib: ["es2020"], strict: false, skipLibCheck: true,
    outDir: out, rootDir: root,
  },
  files: [join(root, "lib/unit-rollup.ts")],
}));

execFileSync("npx", ["tsc", "-p", tsconfig], { stdio: "inherit" });
const R = await import(pathToFileURL(join(out, "lib/unit-rollup.js")).href);

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ok   ${label}`); }
  else {
    fail++;
    console.log(`FAIL   ${label}\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`);
  }
};

// ── Title classification ──────────────────────────────────────────────
const ref = (t) => R.parseUnitRef(t);

eq("unit page is a parent",
   ref("Unit 4.5: Modeling Skills - Partial Elasticities"), { key: "4.5", role: "parent" });
eq("clip with a bare number is a child",
   ref("Clip 4.5: Partial Elasticities"),                   { key: "4.5", role: "child" });
eq('"Clip Unit 4.6" is a child',
   ref("Clip Unit 4.6: Example Unconstrained Optimization"), { key: "4.6", role: "child" });
eq("slides are a child",       ref("Slides 4.7"),           { key: "4.7", role: "child" });
eq("lecture notes are a child",ref("Lecture notes 2.1"),    { key: "2.1", role: "child" });
eq("recording is a child",     ref("Recording Unit 10.2"),  { key: "10.2", role: "child" });
eq("nested clip keeps its full key",
   ref("Clip 4.5.2 Worked example"),                        { key: "4.5.2", role: "child" });
eq("graded exercise never folds", ref("Exercises 4.5"),     null);
eq("quiz never folds",            ref("Quiz clip 4.5"),     null);
eq("assignment never folds",      ref("Clip 4.5 assignment"), null);
eq("prose title is neither",      ref("Course introduction"), null);
eq("a bare number is neither",    ref("4.5 Partial Elasticities"), null);

// ── Folding ───────────────────────────────────────────────────────────
const row = (id, title, extra = {}) => ({
  id, courseCanvasId: "c1", title, dueAt: "2026-09-22T08:00:00Z",
  url: `https://canvas/${id}`, itemType: "external_tool", pointsPossible: 1,
  deadlineSource: "timetable", ...extra,
});

{
  const rows = [
    row(1, "Clip Unit 4.6: Example Unconstrained Optimization"),
    row(2, "Clip 4.5: Partial Elasticities"),
    row(3, "Clip Unit 4.7: Constrained optimization"),
    row(4, "Clip Unit 4.7: Lagrange Multiplier"),
    row(5, "Unit 4.5: Modeling Skills - Partial Elasticities", { itemType: "Page", pointsPossible: null }),
    row(6, "Unit 4.6: Math Skills - Unconstrained Optimization", { itemType: "Page", pointsPossible: null }),
  ];
  const kept = R.rollUpUnits(rows);
  eq("only the unit pages and the orphaned 4.7 clips survive",
     kept.map((r) => r.id), [3, 4, 5, 6]);
  eq("Unit 4.5 absorbed its clip",  kept.find((r) => r.id === 5).rolledUp.map((c) => c.id), [2]);
  eq("Unit 4.6 absorbed its clip",  kept.find((r) => r.id === 6).rolledUp.map((c) => c.id), [1]);
  eq("4.7 clips stay visible — no Unit 4.7 row exists",
     kept.filter((r) => r.id === 3 || r.id === 4).every((r) => r.rolledUp.length === 0), true);
}

{
  // A satellite in a different course must not fold into another course's unit.
  const kept = R.rollUpUnits([
    row(1, "Unit 3.1: Demand", { itemType: "Page" }),
    row(2, "Clip 3.1: Demand curves", { courseCanvasId: "c2" }),
  ]);
  eq("cross-course folding never happens", kept.map((r) => r.id), [1, 2]);
}

{
  // Most specific unit wins.
  const kept = R.rollUpUnits([
    row(1, "Unit 4: Optimization",  { itemType: "Page" }),
    row(2, "Unit 4.5: Elasticities",{ itemType: "Page" }),
    row(3, "Clip 4.5.2 Worked example"),
  ]);
  eq("nested clip folds into the deepest matching unit",
     kept.find((r) => r.id === 2).rolledUp.map((c) => c.id), [3]);
  eq("the shallower unit absorbs nothing",
     kept.find((r) => r.id === 1).rolledUp, []);
}

{
  // Graded work keeps its own row even next to a matching unit.
  const kept = R.rollUpUnits([
    row(1, "Unit 4.5: Elasticities", { itemType: "Page" }),
    row(2, "Clip 4.5: Partial Elasticities"),
    row(3, "Exercises 4.5"),
    row(4, "Quiz 4.5"),
  ]);
  eq("exercises and quizzes survive the fold", kept.map((r) => r.id), [1, 3, 4]);
}

{
  // An undated unit inherits the earliest date of what it absorbed.
  const kept = R.rollUpUnits([
    row(1, "Unit 4.5: Elasticities", { itemType: "Page", dueAt: null, deadlineSource: null }),
    row(2, "Clip 4.5 b", { dueAt: "2026-09-24T08:00:00Z" }),
    row(3, "Clip 4.5 a", { dueAt: "2026-09-22T08:00:00Z" }),
  ]);
  const unit = kept.find((r) => r.id === 1);
  eq("undated unit inherits the earliest satellite date", unit.dueAt, "2026-09-22T08:00:00Z");
  eq("and the donor's provenance with it", unit.deadlineSource, "timetable");
}

{
  // A dated unit never has its own date overwritten.
  const kept = R.rollUpUnits([
    row(1, "Unit 4.5", { itemType: "Page", dueAt: "2026-09-20T08:00:00Z", deadlineSource: "canvas" }),
    row(2, "Clip 4.5 a", { dueAt: "2026-09-18T08:00:00Z" }),
  ]);
  eq("a unit's own date wins", kept.find((r) => r.id === 1).dueAt, "2026-09-20T08:00:00Z");
  eq("and keeps its provenance", kept.find((r) => r.id === 1).deadlineSource, "canvas");
}

{
  eq("rows with no unit number pass through untouched",
     R.rollUpUnits([row(1, "Course introduction"), row(2, "Read the manual")]).map((r) => r.id),
     [1, 2]);
}

rmSync(out, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
