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
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
  process.exit(1);
}

const client = createClient({ url, authToken });

async function query() {
  const res = await client.execute("SELECT id, course_canvas_id, course_name, title, start_at, end_at, source FROM timetable_events ORDER BY start_at LIMIT 20");
  console.log("Timetable events:");
  console.table(res.rows);
  
  const res2 = await client.execute("SELECT * FROM reading_items ORDER BY id LIMIT 20");
  console.log("\nAll reading items:");
  console.table(res2.rows);
}

query().catch(console.error);