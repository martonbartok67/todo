// scripts/test-ai-output.mjs
// One-shot script to capture the raw AI output for a specific syllabus page.
// Usage: node --env-file=.env scripts/test-ai-output.mjs

const CANVAS_BASE = process.env.CANVAS_BASE_URL;
const BEARER      = process.env.CANVAS_BEARER_TOKEN;
const GROQ_KEY    = process.env.GROQ_API_KEY;

if (!CANVAS_BASE || !BEARER || !GROQ_KEY) {
  console.error("Missing env vars: CANVAS_BASE_URL, CANVAS_BEARER_TOKEN, GROQ_API_KEY");
  process.exit(1);
}

// Sample syllabus page from course 57921 (BSc IBA Year 1)
const COURSE_ID = "57921";
const PAGE_URL  = "course-syllabus";

// Mock response for testing
const MOCK_PAGE = {
  title: "Course Syllabus",
  body: "<p>Week 36: Lecture 1 - Chapter 1</p><p>Week 36: Lecture 2 - Chapter 2</p><p>Week 37: Lecture 1 - Chapter 3</p><p>Week 37: Lecture 2 - Chapter 4</p><p>Week 38: Lecture 1 - Chapter 5</p><p>Week 38: Lecture 2 - Chapter 6</p><p>Week 39: Lecture 1 - Chapter 7</p><p>Week 39: Lecture 2 - Chapter 8</p><p>Week 40: Lecture 1 - Chapter 9</p><p>Week 40: Lecture 2 - Chapter 10</p><p>Week 41: Lecture 1 - Chapter 11</p><p>Week 41: Lecture 2 - Chapter 12</p><p>Week 42: Lecture 1 - Chapter 13</p><p>Week 42: Lecture 2 - Chapter 14</p><p>Week 43: Lecture 1 - Chapter 15</p><p>Week 43: Lecture 2 - Chapter 16</p><p>Week 44: Lecture 1 - Chapter 17</p><p>Week 44: Lecture 2 - Chapter 18</p><p>Week 45: Lecture 1 - Chapter 19</p><p>Week 45: Lecture 2 - Chapter 20</p><p>Week 46: Lecture 1 - Chapter 21</p><p>Week 46: Lecture 2 - Chapter 22</p><p>Week 47: Lecture 1 - Chapter 23</p><p>Week 47: Lecture 2 - Chapter 24</p><p>Week 48: Lecture 1 - Chapter 25</p><p>Week 48: Lecture 2 - Chapter 26</p><p>Week 49: Lecture 1 - Chapter 27</p><p>Week 49: Lecture 2 - Chapter 28</p>",
};

async function fetchPage() {
  const url = `${CANVAS_BASE}/api/v1/courses/${COURSE_ID}/pages/${PAGE_URL}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${BEARER}` },
  });
  if (!res.ok) throw new Error(`Canvas API ${res.status} for ${url}`);
  return await res.json();
}

async function callGroq(pageTitle, prompt) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model:       "openai/gpt-oss-120b",
      max_tokens:  2048,
      temperature: 0,
      messages: [
        {
          role:    "system",
          content: "You are a precise data extractor. Output only valid JSON arrays, no prose, no markdown.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "[]";
}

(async () => {
  console.log(`Fetching page ${PAGE_URL} from course ${COURSE_ID}...`);
  const page = MOCK_PAGE;
  console.log(`\nPage title: ${page.title}\nBody length: ${page.body.length} chars`);

  console.log("\nCalling Groq...");
  const raw = await callGroq(page.title, page.body);
  console.log("\nRaw AI output:");
  console.log(raw);

  console.log("\nDone. The raw JSON output is above. If the weekNumber is missing or malformed, the coercion logic in lib/canvas/extract.ts needs to be updated.");
})().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});