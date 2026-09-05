/**
 * Transforms raw Canvas API objects into NewTask records for Drizzle upsert.
 * All timestamps are normalised to ISO 8601 UTC strings.
 * HTML is stripped from descriptions to plain text (server-side, no DOM).
 */
import type { NewTask } from "@/drizzle/schema";

// ── Canvas API types (minimal — only fields we use) ────────────────────────

export type CanvasAssignment = {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;          // ISO 8601, may be null
  points_possible: number | null;
  html_url: string;
  submission_types: string[];
};

export type CanvasModuleItem = {
  id: number;
  title: string;
  type: string;                   // "Assignment"|"Page"|"File"|"ExternalUrl"|etc.
  html_url: string | null;
  external_url: string | null;
  completion_requirement?: {
    type: string;
    completed: boolean;
  };
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Strip HTML tags; collapse whitespace; truncate to 500 chars. */
function stripHtml(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 500) || null;
}

/** Ensure a Canvas timestamp is UTC ISO 8601, or return null. */
function toUtc(ts: string | null): string | null {
  if (!ts) return null;
  // Canvas always sends UTC (Z suffix). Parse and re-serialize to be safe.
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Transformers ───────────────────────────────────────────────────────────

export function assignmentToTask(
  a: CanvasAssignment,
  courseCanvasId: string
): NewTask {
  return {
    courseCanvasId,
    canvasId:       String(a.id),
    sourceType:     "assignment",
    title:          a.name,
    itemType:       a.submission_types?.[0] ?? null,
    dueAt:          toUtc(a.due_at),
    pointsPossible: a.points_possible ?? null,
    url:            a.html_url,
    description:    stripHtml(a.description),
    completedAt:    null,
    snoozedUntil:   null,
    lastSyncedAt:   new Date().toISOString(),
  };
}

export function moduleItemToTask(
  m: CanvasModuleItem,
  courseCanvasId: string
): NewTask {
  return {
    courseCanvasId,
    canvasId:       String(m.id),
    sourceType:     "module_item",
    title:          m.title,
    itemType:       m.type,
    dueAt:          null,          // module items never have due dates
    pointsPossible: null,
    url:            m.html_url ?? m.external_url ?? null,
    description:    null,
    completedAt:    null,
    snoozedUntil:   null,
    lastSyncedAt:   new Date().toISOString(),
  };
}
