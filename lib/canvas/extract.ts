/**
 * AI-powered extraction of reading lists from Canvas page HTML.
 * Calls Anthropic API server-side — key never sent to client.
 *
 * Heuristic: only send pages whose title or content suggests
 * they are a syllabus / course manual / reading list, to avoid
 * burning tokens on every page.
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

/** Returns true if the page is likely a syllabus/manual worth extracting. */
export function looksLikeSyllabus(title: string, bodySnippet: string): boolean {
  const haystack = (title + " " + bodySnippet).toLowerCase();
  return SYLLABUS_KEYWORDS.some((kw) => haystack.includes(kw));
}

/** Strip HTML and truncate to keep within token limits (~6000 chars ≈ 1500 tokens). */
function prepareText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

/**
 * Send page text to Claude and parse structured reading list.
 * Returns empty array if nothing useful found.
 */
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
- "lectureLabel": string — the week/lecture/session label, e.g. "Week 1" or "Lecture 3 — Supply & Demand"
- "readingText": string — author, year, title, chapter. E.g. "Smith (2019) Ch. 4"
- "detail": string or null — page range, URL, or extra note if present, else null

If no structured reading list is found, return an empty array: []
Return only the JSON array, no other text.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return [];

    const data = await res.json() as {
      content: { type: string; text: string }[];
    };

    const raw = data.content.find((b) => b.type === "text")?.text ?? "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed  = JSON.parse(cleaned) as ExtractedReading[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
