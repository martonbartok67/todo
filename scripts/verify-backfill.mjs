// scripts/verify-backfill.mjs
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

async function verify() {
  const res = await client.execute("SELECT id, course_canvas_id, lecture_label, reading_text, week_number, lecture_slot, source FROM reading_items WHERE week_number IS NOT NULL ORDER BY id DESC LIMIT 10");
  console.log("Readings with week_number:");
  console.table(res.rows);

  const stats = await client.execute("SELECT count(*) as total, count(week_number) as with_week FROM reading_items");
  console.log("\nStats:");
  console.table(stats.rows);
}

verify().catch(console.error);
