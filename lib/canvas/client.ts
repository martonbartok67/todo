/**
 * Canvas API client — server-side only.
 * Handles auth, pagination via <Link> headers, and rate-limit retries.
 * The bearer token is NEVER sent to the client.
 */

const MAX_RETRIES = 3;

type CanvasConfig = { baseUrl: string; bearer: string };

/**
 * Read Canvas env vars at request time and throw a clear error if any are
 * missing. Doing this lazily (instead of at module load) means a misconfigured
 * deployment produces a readable 500 message, not an opaque "Invalid URL"
 * thrown from deep inside `new URL()`.
 */
function getCanvasConfig(): CanvasConfig {
  const baseUrl = process.env.CANVAS_BASE_URL;
  const bearer  = process.env.CANVAS_BEARER_TOKEN;
  const missing = [
    !baseUrl && "CANVAS_BASE_URL",
    !bearer  && "CANVAS_BEARER_TOKEN",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    throw new Error(
      `Canvas sync unavailable: missing env var(s): ${missing.join(", ")}. ` +
      `Add them in Vercel → Settings → Environment Variables, then redeploy.`
    );
  }

  return { baseUrl: baseUrl!, bearer: bearer! };
}

type FetchOptions = { params?: Record<string, string> };

/** Parse the `next` URL from a Canvas HTTP Link header, or null if last page. */
export function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Canvas format: <https://...?page=2&per_page=100>; rel="next", ...
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

/** Single authenticated GET with retry on 429/5xx. */
async function canvasFetch(url: string, attempt = 1): Promise<Response> {
  const { bearer } = getCanvasConfig();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    next: { revalidate: 0 }, // never cache — always fresh
  });

  if (res.status === 429 || (res.status >= 500 && attempt < MAX_RETRIES)) {
    const delay = attempt * 2000;
    await new Promise((r) => setTimeout(r, delay));
    return canvasFetch(url, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`Canvas API error ${res.status} at ${url}`);
  }

  return res;
}

/** Build a Canvas API URL with query params. */
function buildUrl(path: string, params?: Record<string, string>): string {
  const { baseUrl } = getCanvasConfig();
  const url = new URL(`${baseUrl}/api/v1${path}`);
  url.searchParams.set("per_page", "100"); // max Canvas allows
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

/**
 * Fetch ALL pages for a Canvas endpoint.
 * Follows <Link rel="next"> headers until exhausted.
 * Returns a flat array of all records.
 */
export async function fetchAllPages<T>(
  path: string,
  options: FetchOptions = {}
): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = buildUrl(path, options.params);

  while (url) {
    const res  = await canvasFetch(url);
    const page = (await res.json()) as T[];
    results.push(...page);
    url = parseNextLink(res.headers.get("link"));
  }

  return results;
}
