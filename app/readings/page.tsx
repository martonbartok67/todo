import { db, dbReady } from "@/lib/db";
import { courses, readingItems } from "@/drizzle/schema";
import { asc } from "drizzle-orm";
import ReadingsDashboard from "@/components/ReadingsDashboard";
import { PageChrome } from "@/components/PageChrome";
import type { ReadingItem } from "@/drizzle/schema";

export const dynamic = "force-dynamic";

export default async function ReadingsPage() {
  let items: ReadingItem[] = [];
  let courseList: Array<{ canvasId: string; name: string }> = [];

  try {
    // reading_items carries columns (linked_timetable_event_id,
    // deadline_confidence) that may have just been added — see
    // lib/tasks.ts's fetchPendingRows() for why this awaits dbReady().
    await dbReady();
    [items, courseList] = await Promise.all([
      db.select().from(readingItems).orderBy(
        asc(readingItems.courseCanvasId),
        asc(readingItems.lectureLabel),
        asc(readingItems.readingText),
      ),
      db.select({ canvasId: courses.canvasId, name: courses.name })
        .from(courses).orderBy(asc(courses.name)),
    ]);
  } catch (e) {
    console.error("readings page query failed (non-fatal):", e);
  }

  return (
    <PageChrome active="readings">
      <ReadingsDashboard items={items} courses={courseList} tableReady={true} />
    </PageChrome>
  );
}
