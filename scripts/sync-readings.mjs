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
import { readings as parsedReadings } from "./parse-course-manual.mjs";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Missing env vars: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
  process.exit(1);
}

const client = createClient({ url, authToken });

async function syncReadings() {
  console.log("🚀 Starting readings synchronization via libSQL client...");

  // 1. Fetch timetable events
  const eventRes = await client.execute("SELECT id, course_canvas_id, course_code, start_at FROM timetable_events WHERE start_at >= '2026-09-01' ORDER BY start_at");
  const events = eventRes.rows;
  console.log(`📊 Found ${events.length} timetable events.`);

  // Group events by course code
  const eventsByCourse = {};
  for (const event of events) {
    const code = event.course_code;
    if (!code) continue;
    if (!eventsByCourse[code]) eventsByCourse[code] = [];
    eventsByCourse[code].push(event);
  }

  // 2. Clear existing AI-extracted readings
  await client.execute("DELETE FROM reading_items WHERE source = 'ai'");
  console.log("🗑️ Deleted existing AI readings.");

  // 3. Prepare inserts
  const stmts = [];
  
  for (const reading of parsedReadings) {
    const courseCode = reading.courseCanvasId === "57921" ? "BT1203" : 
                       reading.courseCanvasId === "57918" ? "BT1201" : 
                       reading.courseCanvasId === "57916" ? "BT1202" : null;

    let matchedEvent = null;

    if (courseCode && eventsByCourse[courseCode]) {
      const courseEvents = eventsByCourse[courseCode];

      if (courseCode === "BT1203") {
        const sessionMatch = reading.lectureLabel.match(/Session (\d+)/i);
        if (sessionMatch) {
          const sessionNum = parseInt(sessionMatch[1]);
          matchedEvent = courseEvents[sessionNum - 1];
        }
      } else if (reading.termWeek) {
        // Term Week W starts on Sept 1 + (W-1)*7 days
        const termStart = new Date("2026-09-01");
        const weekStart = new Date(termStart.getTime() + (reading.termWeek - 1) * 7 * 24 * 60 * 60 * 1000);
        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

        matchedEvent = courseEvents.find(e => {
          const d = new Date(e.start_at);
          return d >= weekStart && d < weekEnd;
        });
      }
    }

    stmts.push({
      sql: `INSERT INTO reading_items (
        course_canvas_id, course_name, lecture_label, reading_text, 
        detail, week_number, lecture_slot, source, 
        lecture_date, linked_timetable_event_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ai', ?, ?)`,
      args: [
        reading.courseCanvasId,
        reading.courseName,
        reading.lectureLabel,
        reading.readingText,
        reading.detail || null,
        reading.termWeek || null,
        reading.lectureSlot || "unknown",
        matchedEvent ? matchedEvent.start_at : null,
        matchedEvent ? matchedEvent.id : null
      ]
    });
  }

  // 4. Batch insert
  if (stmts.length > 0) {
    const chunkSize = 25;
    for (let i = 0; i < stmts.length; i += chunkSize) {
      const chunk = stmts.slice(i, i + chunkSize);
      await client.batch(chunk);
      console.log(`  Processed ${Math.min(i + chunkSize, stmts.length)}/${stmts.length} readings...`);
    }
    console.log(`✅ Successfully synced ${stmts.length} readings.`);
  } else {
    console.log("⚠️ No readings to insert.");
  }
}

syncReadings().catch(err => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});