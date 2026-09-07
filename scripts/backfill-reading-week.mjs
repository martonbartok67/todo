// scripts/backfill-reading-week.mjs
// One-shot script to backfill week_number + lecture_slot on existing
// reading_items rows. We can't recover the data locally (the original
// AI extraction didn't ask for it), so the only option is to re-run
// the AI pass over every course. This hits the live /api/sync endpoint
// in the standard way so the production code path does the work.
//
// Usage:  node --env-file=.env scripts/backfill-reading-week.mjs
//
// Requires the dev server to be running on $APP_URL (default
// http://localhost:3000) so the /api/sync?phase=ai endpoint is
// reachable. The endpoint requires the CRON_SECRET bearer token.

const APP_URL    = process.env.APP_URL    || "http://localhost:3006";
const CRON_SECRET = process.env.CRON_SECRET || "abcdefg12345";

if (!CRON_SECRET) {
  console.error("Set CRON_SECRET in .env");
  process.exit(1);
}

// Fetch the course list by hitting the /api/sync?phase=tasks endpoint
// (which returns the course IDs without doing a full sync).
async function getCourseIds() {
  const url = `${APP_URL}/api/sync?phase=tasks`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${CRON_SECRET}` },
  });
  if (!res.ok) throw new Error(`phase=tasks returned ${res.status}`);
  const body = await res.json();
  return body.courseIdsForAI || body.courseIds || [];
}

async function runAiForCourse(courseId) {
  const url = `${APP_URL}/api/sync?phase=ai&courseId=${courseId}&offset=0&limit=20`;
  let offset = 0;
  let pagesProcessed = 0;
  while (true) {
    const r = await fetch(`${APP_URL}/api/sync?phase=ai&courseId=${courseId}&offset=${offset}&limit=20`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${CRON_SECRET}` },
    });
    if (!r.ok) {
      console.error(`  course ${courseId}: phase=ai returned ${r.status}, stopping`);
      return pagesProcessed;
    }
    const j = await r.json();
    pagesProcessed += j.pagesProcessed ?? 0;
    if (j.nextOffset === null || j.nextOffset === undefined) break;
    offset = j.nextOffset;
  }
  return pagesProcessed;
}

(async () => {
  console.log(`App: ${APP_URL}`);
  console.log("Fetching course list...");
  const ids = await getCourseIds();
  console.log(`Found ${ids.length} courses eligible for AI re-run.`);
  let total = 0;
  for (const id of ids) {
    process.stdout.write(`  course ${id} ... `);
    const n = await runAiForCourse(id);
    total += n;
    console.log(`${n} pages re-extracted`);
  }
  console.log(`\nDone. Re-extracted ${total} pages across ${ids.length} courses.`);
  console.log("Reading items now have week_number + lecture_slot populated where the AI could determine them.");
})().catch((e) => {
  console.error("Backfill failed:", e);
  process.exit(1);
});
