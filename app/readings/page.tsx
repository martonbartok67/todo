import { db, dbReady } from "@/lib/db";
import { courses, readingItems } from "@/drizzle/schema";
import { asc } from "drizzle-orm";
import ReadingsDashboard from "@/components/ReadingsDashboard";
import { PageChrome } from "@/components/PageChrome";
import type { ReadingItem } from "@/drizzle/schema";
import { isMissingColumnError, READING_COLUMNS_SAFE } from "@/lib/readings";

export const dynamic = "force-dynamic";

export default async function ReadingsPage() {
  let items: ReadingItem[] = [];
  let courseList: Array<{ canvasId: string; name: string }> = [];

  try {
    // reading_items carries columns (linked_timetable_event_id,
    // deadline_confidence) that may have just been added — see
    // lib/tasks.ts's withTaskColumnFallback() for why this awaits
    // dbReady() and still needs the try/catch fallback below.
    await dbReady();
    const order = [
      asc(readingItems.courseCanvasId),
      asc(readingItems.lectureLabel),
      asc(readingItems.readingText),
    ] as const;
    let readingRows: ReadingItem[];
    try {
      readingRows = await db.select().from(readingItems).orderBy(...order);
    } catch (e) {
      if (!isMissingColumnError(e)) throw e;
      console.error("readings page: linked_timetable_event_id/deadline_confidence unreadable, falling back:", e);
      const safeRows = await db.select(READING_COLUMNS_SAFE).from(readingItems).orderBy(...order);
      readingRows = safeRows.map((r) => ({ ...r, linkedTimetableEventId: null, deadlineConfidence: null }));
    }
    items = readingRows;
    courseList = await db.select({ canvasId: courses.canvasId, name: courses.name })
      .from(courses).orderBy(asc(courses.name));
  } catch (e) {
    console.error("readings page query failed (non-fatal):", e);
  }

  return (
    <PageChrome active="readings">
      <ReadingsDashboard items={items} courses={courseList} tableReady={true} />
    </PageChrome>
  );
}
