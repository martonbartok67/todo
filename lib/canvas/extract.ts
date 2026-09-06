/**
 * AI-powered extraction of reading lists from Canvas page HTML.
 * Uses Groq API (llama-3.3-70b-versatile) — fast and free-tier friendly.
 */

export type ExtractedReading = {
  lectureLabel: string;
  readingText:  string;
  detail:       string | null;
};

const SYLLABUS_KEYWORDS = [
  "syllabus","course manual","reading list","literature","schedule",
  "weekly plan","lecture plan","course guide","studiemateriaal",
  "literature list","compulsory reading","required reading",
];

export function looksLikeSyllabus(title: string, bodySnippet: string): boolean {
  const haystack = (title + " " + bodySnippet).toLowerCase();
  return SYLLABUS_KEYWORDS.some((kw) => haystack.includes(kw));
}

function prepareText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

export async function extractReadings(
  pageTitle: string,
  pageHtml: string,
  courseName: string,
): Promise<ExtractedReading[]> {
  const text = prepareText(pageHtml);
  if (!text) return [];

  const prompt = `You are extracting a structured reading list from a university course document.

Course: ${courseName}
Page title: ${pageTitle}

Document text:
${text}

Extract every required/compulsory reading grouped by lecture, week, or session.
Return ONLY a JSON array. Each element must have exactly these keys:
- "lectureLabel": string — e.g. "Week 1" or "Lecture 3 — Supply & Demand"
- "readingText": string — author, year, title, chapter. E.g. "Smith (2019) Ch. 4"
- "detail": string or null — page range, URL, or extra note if present, else null

If no structured reading list is found, return [].
Return only the JSON array, no other text, no markdown fences.`;

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY!}`,
      },
      body: JSON.stringify({
        model:       "llama-3.3-70b-versatile",
        max_tokens:  1024,
        temperature: 0,
        messages: [
          {
            role:    "system",
            content: "You are a precise data extractor. Return only valid JSON arrays, no prose.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) return [];

    const data = await res.json() as {
      choices: { message: { content: string } }[];
    };

    const raw     = data.choices?.[0]?.message?.content ?? "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed  = JSON.parse(cleaned) as ExtractedReading[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
