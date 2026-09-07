/**
 * AI-powered extraction of reading lists from Canvas course pages.
 * Handles EUR/Erasmus-style schedules: week tables, module lists, chapter refs.
 */

export type ExtractedReading = {
  lectureLabel: string;  // e.g. "Week 36 — Lecture 1" or "Module 3 (wk38)"
  readingText:  string;  // e.g. "Chapters 1 & 3" or "Chapter 5"
  detail:       string | null;  // topic/title if available
};

// Broad keyword set — matches schedules, module overviews, and course manuals
const SYLLABUS_KEYWORDS = [
  "syllabus","course manual","reading list","literature","studiemateriaal",
  "compulsory reading","required reading","weekly plan","lecture plan",
  // Schedule/table patterns common at EUR
  "lecture 1","lecture 2","week 36","week 37","week 38","week 39","week 40",
  "module 1","module 2","module 3","preparation","chapter","chapters",
  "session overview","block 1","block 2","schedule","programme",
  "wk36","wk37","wk38","wk39","wk40","wk41",
];

export function looksLikeSyllabus(title: string, bodySnippet: string): boolean {
  const haystack = (title + " " + bodySnippet).toLowerCase();
  return SYLLABUS_KEYWORDS.some((kw) => haystack.includes(kw));
}

// Always attempt extraction on ALL pages during first sync
// so we don't miss manuals with unusual titles.
// After extraction, only non-empty results are stored.
export const EXTRACT_ALL_PAGES = true;

function prepareText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

export async function extractReadings(
  pageTitle: string,
  pageHtml: string,
  courseName: string,
): Promise<ExtractedReading[]> {
  const text = prepareText(pageHtml);
  if (text.length < 50) return [];

  // Fast path: no API key configured → no AI calls. Caller also guards on
  // this, but defending at the leaf means direct test callers / future
  // re-entry points behave the same.
  if (!process.env.GROQ_API_KEY) return [];

  const prompt = `You are extracting a structured reading/preparation list from a university course page.

Course: ${courseName}
Page title: ${pageTitle}

Document text:
${text}

This may be a lecture schedule, module overview, course manual, or a
synthetic "module structure" page that lists a Canvas module's items
(prefixed with [ExternalUrl], [File], [Page], [Quiz], etc.).

The course may use:
- Week numbers (e.g. "Week 36", "wk36") with lecture topics and chapter references
- Module numbers (e.g. "Module 1 - Introduction (wk36)") with chapter numbers
- Simple chapter references like "Chapters 1 & 3" or "Chapter 6"
- Topics like "What is OB? Introduction" paired with preparation material
- Module structure: a "Module N: <topic>" header with a list of items
  underneath. Each such module is itself a lecture/session, even if the
  page does not name chapters explicitly.

Extract every lecture/module/session that has associated reading or
preparation material. If a module structure is present and the module
name describes a topic, treat the whole module as one reading entry
(the items inside it are the supporting material — list them in detail).

Return ONLY a JSON array. Each element must have exactly these keys:
- "lectureLabel": string — combine week+lecture info, e.g. "Week 36 — Lecture 1" or "Module 3 (wk38)" or "Module 4: Cultural and institutional frameworks"
- "readingText": string — the chapter/reading reference OR the module topic itself if no explicit chapter is listed, e.g. "Chapters 1 & 3" or "Chapter 5 — Cultural Frameworks" or "Module 4: Cultural and institutional frameworks"
- "detail": string or null — the lecture topic or extra note, e.g. "What is OB? Introduction to the field" or "Welcome / 4.1 What are institutions? / 4.2 What are institutions? Culture"

Rules:
- One entry per lecture/module per reading reference
- If a module lists multiple chapters, create one entry per chapter
- If a module has a clear topic but no explicit reading, still create one entry with the module name as the readingText and a short detail that lists the sub-items
- Skip pure quizzes / assignment-submission items that have no reading
- If the page contains no structured reading/preparation content at all, return []
- Return only the JSON array, no markdown, no explanation`;

  try {
    return await callGroqWithRetry(pageTitle, prompt);
  } catch (err) {
    console.error(`extractReadings failed for page "${pageTitle}":`, err);
    return [];
  }
}

/**
 * Call Groq with retry on 429 / 5xx / network errors.
 *
 * The free Groq tier limits tokens-per-minute (TPM) at 8000. Burst calls
 * from a single sync can blow past that. The 429 response includes
 * `error.message` like "Limit 8000, Used 7037, Requested 1100", and our
 * retry will eventually succeed once the 60-second TPM window refills.
 */
async function callGroqWithRetry(
  pageTitle: string,
  prompt:    string,
): Promise<ExtractedReading[]> {
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
          // `llama-3.3-70b-versatile` was retired by Groq; `gpt-oss-120b` is
          // the closest free replacement (120B params, json_mode, structured
          // outputs). If you ever see "model not found" again, list available
          // models with: GET https://api.groq.com/openai/v1/models
          model:       process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
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
        // 2-minute ceiling per call so a single hung request can't pin the
        // whole sync. GPT-OSS-120B normally responds in 3–8s; this is just
        // insurance against network stalls or model timeouts.
        signal: AbortSignal.timeout(120_000),
      });

      // Retry on rate limit (429) and transient server errors (5xx).
      if (res.status === 429 || res.status >= 500) {
        const body = await res.text().catch(() => "");
        lastErr = new Error(`Groq API ${res.status}: ${body.slice(0, 200)}`);
        const delay = 2000 * attempt; // 2s, 4s, 6s, 8s
        console.warn(
          `Groq ${res.status} for page "${pageTitle}" (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        // Non-retryable: log and bail.
        console.error(`Groq API ${res.status} for page "${pageTitle}":`, body);
        return [];
      }

      const data = await res.json() as {
        choices: { message: { content: string } }[];
      };

      const raw     = data.choices?.[0]?.message?.content ?? "[]";
      const cleaned = raw.replace(/```json|```/g, "").trim();

      // Find the JSON array even if there's surrounding text
      const match = cleaned.match(/\[[\s\S]*\]/);
      if (!match) return [];

      const parsed = JSON.parse(match[0]) as ExtractedReading[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      lastErr = err;
      // Network/timeout — also worth retrying.
      const delay = 2000 * attempt;
      console.warn(
        `Groq network error for page "${pageTitle}" (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}ms:`,
        err
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  console.error(`Groq gave up after ${MAX_ATTEMPTS} attempts for page "${pageTitle}":`, lastErr);
  return [];
}
