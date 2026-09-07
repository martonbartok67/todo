/**
 * 🧠 AI classification — TASK vs INFO.
 *
 * Step 2 of the visual & feature overhaul. We feed each Canvas module
 * item (or assignment) to Groq and ask: "is this something the student
 * has to *do*, or just a *document* they read/reference?"
 *
 *   TASK → keep in the actionable list (current behavior)
 *   INFO → relegate to the new Resources tab
 *
 * Why this exists: Canvas modules are mostly links/files, but the API
 * dumps them all into the same `tasks` table. We were showing every
 * PDF as a to-do. Now we don't.
 *
 * Same retry / rate-limit handling as `extract.ts` — Groq's free tier
 * has an 8000-tokens-per-minute ceiling and bursts can blow past it.
 */
export type ClassifyVerdict = "task" | "info";

export type ClassifyInput = {
  id:          number;
  title:       string;
  description: string | null;
  itemType:    string | null; // Canvas type: "Page", "File", "ExternalUrl", etc.
};

export type ClassifyResult = {
  id:      number;
  verdict: ClassifyVerdict;
  reason:  string;
};

// Trim descriptions so we don't burn tokens on huge pages. The first
// ~500 chars are almost always enough for the verdict.
function truncate(s: string | null, max = 500): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// The system prompt is small on purpose. The model is just being asked
// a yes/no question with a 4-word reason; no need for elaborate
// instruction.
const SYSTEM_PROMPT = `You classify Canvas LMS module items for a university student.

For each item, decide:
  - "task" → the student must DO something (submit, complete, attend, prepare a deliverable)
  - "info"  → it's a static reference (syllabus, formula sheet, past exam solutions, article for reading, FAQ, lecture recording)

Examples of "info":
  - "Solutions Resit Exam 2023-2024"
  - "Course Syllabus"
  - "Formula Sheet — Module 4"
  - "Lecture recording — Week 3"
  - "Frequently Asked Questions"
  - "Software Installation Guide"

Examples of "task":
  - "Assignment 1 — Market Analysis (due Sep 30)"
  - "Group Project — Phase 2 Submission"
  - "Quiz: Chapters 1-3"
  - "Discussion: Post your reflection (2 posts)"
  - "Workshop preparation — Read case study X"

You MUST respond with ONLY a JSON array, no prose, no markdown fences.
Each element: { "id": <number>, "verdict": "task" | "info", "reason": "<=8 words" }`;

function buildUserPrompt(items: ClassifyInput[]): string {
  const lines = items.map((it) => {
    const desc = truncate(it.description);
    const type = it.itemType ? ` [${it.itemType}]` : "";
    return `id=${it.id}${type}\n  title: ${it.title}${desc ? `\n  desc:  ${desc}` : ""}`;
  });
  return lines.join("\n\n");
}

async function callGroqWithRetry(prompt: string): Promise<ClassifyResult[]> {
  const MAX_ATTEMPTS = 4;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY!}`,
        },
        body: JSON.stringify({
          model:       process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
          max_tokens:  2048,
          temperature: 0,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user",   content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (res.status === 429 || res.status >= 500) {
        const body = await res.text().catch(() => "");
        lastErr = new Error(`Groq API ${res.status}: ${body.slice(0, 200)}`);
        const delay = 2000 * attempt;
        console.warn(`Groq classify ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        console.error(`Groq classify ${res.status}:`, await res.text());
        return [];
      }

      const data = (await res.json()) as { choices: { message: { content: string } }[] };
      const raw     = data.choices?.[0]?.message?.content ?? "[]";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      const match   = cleaned.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const parsed = JSON.parse(match[0]) as ClassifyResult[];
      // Coerce unknown verdicts to "task" so we never silently lose rows.
      return parsed.map((r) => ({
        id:      r.id,
        verdict: r.verdict === "info" ? "info" : "task",
        reason:  typeof r.reason === "string" ? r.reason.slice(0, 120) : "",
      }));
    } catch (err) {
      lastErr = err;
      const delay = 2000 * attempt;
      console.warn(`Groq classify network error (attempt ${attempt}/${MAX_ATTEMPTS}):`, err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.error(`Groq classify gave up after ${MAX_ATTEMPTS} attempts:`, lastErr);
  return [];
}

/**
 * Classify a batch of items in one Groq call.
 *
 * Returns a Map keyed by input id so the caller can do a quick lookup
 * when writing back to the DB. Items the AI didn't return a verdict
 * for are simply absent from the map — caller treats them as "task"
 * (safer default than dropping them).
 *
 * Batches of ~30 fit comfortably in one prompt; larger batches
 * exceed the 8K TPM free-tier ceiling, so callers should chunk.
 */
export async function classifyItems(items: ClassifyInput[]): Promise<Map<number, ClassifyResult>> {
  const out = new Map<number, ClassifyResult>();
  if (!process.env.GROQ_API_KEY || items.length === 0) return out;

  const prompt = buildUserPrompt(items);
  const results = await callGroqWithRetry(prompt);
  for (const r of results) {
    if (typeof r.id === "number") out.set(r.id, r);
  }
  return out;
}
