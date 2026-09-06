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

This may be a lecture schedule, module overview, or course manual. It may use:
- Week numbers (e.g. "Week 36", "wk36") with lecture topics and chapter references
- Module numbers (e.g. "Module 1 - Introduction (wk36)") with chapter numbers
- Simple chapter references like "Chapters 1 & 3" or "Chapter 6"
- Topics like "What is OB? Introduction" paired with preparation material

Extract every lecture/module/session that has associated reading or preparation material.

Return ONLY a JSON array. Each element must have exactly these keys:
- "lectureLabel": string — combine week+lecture info, e.g. "Week 36 — Lecture 1" or "Module 3 (wk38)"
- "readingText": string — the chapter/reading reference, e.g. "Chapters 1 & 3" or "Chapter 5 — Cultural Frameworks"
- "detail": string or null — the lecture topic or extra note, e.g. "What is OB? Introduction to the field"

Rules:
- One entry per lecture/module per reading reference
- If a module lists multiple chapters, create one entry per chapter
- If there is no reading for a session, skip it
- If the page contains no structured reading/preparation content at all, return []
- Return only the JSON array, no markdown, no explanation`;

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

    if (!res.ok) {
      const body = await res.text();
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
    console.error(`extractReadings failed for page "${pageTitle}":`, err);
    return [];
  }
}
