(function patchGlobalFetch() {
  const g = globalThis;
  const original = g.fetch.bind(g);
  g.fetch = ((input, init) => {
    let urlStr = "";
    if (typeof input === "string") urlStr = input;
    else if (input instanceof URL) urlStr = input.href;
    else if (input && typeof input === "object" && "url" in input) urlStr = String(input.url);
    if (urlStr && (urlStr.includes("/v1/jobs") || urlStr.includes("/v2/jobs"))) {
      return Promise.resolve(new Response(null, { status: 404 }));
    }
    return original(input, init);
  });
})();

import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Missing env vars");
  process.exit(1);
}

const client = createClient({ url, authToken });

async function query() {
  // Get all timetable events
  const res = await client.execute({
    sql: "SELECT course_name, start_at, title FROM timetable_events WHERE start_at >= '2026-09-01' ORDER BY start_at LIMIT 50",
    args: []
  });
  console.log("Timetable events (Sep onwards):");
  for (const row of res.rows) {
    console.log(`  ${row.start_at} | ${row.course_name} | ${row.title}`);
  }
  
  // Get all reading items
  const readings = await client.execute({
    sql: "SELECT id, course_canvas_id, lecture_label, reading_text, week_number, lecture_slot FROM reading_items ORDER BY course_canvas_id, id",
    args: []
  });
  console.log("\nAll reading items:");
  for (const row of readings.rows) {
    console.log(`  id=${row.id} course=${row.course_canvas_id} label="${row.lecture_label}" reading="${row.reading_text}" week=${row.week_number} slot=${row.lecture_slot}`);
  }
  
  // Get all courses
  const courses = await client.execute({
    sql: "SELECT canvas_id, name, course_code FROM courses ORDER BY name",
    args: []
  });
  console.log("\nCourses:");
  for (const row of courses.rows) {
    console.log(`  ${row.canvas_id} | ${row.name} | ${row.course_code}`);
  }

  // Get all timetable events for week 3 (Sept 15-21)
  const week3 = await client.execute({
    sql: "SELECT course_name, start_at, title FROM timetable_events WHERE start_at >= '2026-09-15' AND start_at < '2026-09-23' ORDER BY start_at",
    args: []
  });
  console.log("\nWeek 3 (Sept 15-21) timetable events:");
  for (const row of week3.rows) {
    console.log(`  ${row.start_at} | ${row.course_name} | ${row.title}`);
  }
}

query().catch(console.error);