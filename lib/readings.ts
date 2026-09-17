import { readingItems } from "@/drizzle/schema";

/**
 * Column set for `reading_items` excluding the two Step-4 columns
 * (linkedTimetableEventId, deadlineConfidence) that can be intermittently
 * unreadable on this connection — see lib/tasks.ts's TASK_COLUMNS_SAFE for
 * the full explanation of why a query needs this fallback at all.
 */
export const READING_COLUMNS_SAFE = {
  id:             readingItems.id,
  courseCanvasId: readingItems.courseCanvasId,
  courseName:     readingItems.courseName,
  lectureLabel:   readingItems.lectureLabel,
  readingText:    readingItems.readingText,
  detail:         readingItems.detail,
  completedAt:    readingItems.completedAt,
  sourcePageUrl:  readingItems.sourcePageUrl,
  createdAt:      readingItems.createdAt,
  updatedAt:      readingItems.updatedAt,
  weekNumber:     readingItems.weekNumber,
  lectureSlot:    readingItems.lectureSlot,
  source:         readingItems.source,
  lectureDate:    readingItems.lectureDate,
};

export function isMissingColumnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /no such column/i.test(msg);
}
