/**
 * Transforms raw Canvas API objects into NewTask records.
 * Descriptions: strip HTML, store up to 2000 chars (up from 500).
 */
import type { NewTask } from "@/drizzle/schema";

export type CanvasAssignment = {
  id: number;
  name: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  html_url: string;
  submission_types: string[];
};

export type CanvasModuleItem = {
  id: number;
  title: string;
  type: string;
  html_url: string | null;
  external_url: string | null;
  page_url?: string | null;
  completion_requirement?: { type: string; completed: boolean };
};

function stripHtml(html: string | null): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 2000) || null;
}

function toUtc(ts: string | null): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function assignmentToTask(a: CanvasAssignment, courseCanvasId: string): NewTask {
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

export function moduleItemToTask(m: CanvasModuleItem, courseCanvasId: string): NewTask {
  return {
    courseCanvasId,
    canvasId:       String(m.id),
    sourceType:     "module_item",
    title:          m.title,
    itemType:       m.type,
    dueAt:          null,
    pointsPossible: null,
    url:            m.html_url ?? m.external_url ?? null,
    description:    null,   // fetched separately in sync for Page type
    completedAt:    null,
    snoozedUntil:   null,
    lastSyncedAt:   new Date().toISOString(),
  };
}
