import { db } from "@/lib/db";
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
    [items, courseList] = await Promise.all([
      db.select().from(readingItems).orderBy(
        asc(readingItems.courseCanvasId),
        asc(readingItems.lectureLabel),
        asc(readingItems.readingText),
      ),
      db.select({ canvasId: courses.canvasId, name: courses.name })
        .from(courses).orderBy(asc(courses.name)),
    ]);
  } catch {
    // DB unavailable or table missing
  }

  return (
    <PageChrome active="readings">
      <ReadingsDashboard items={items} courses={courseList} tableReady={true} />
    </PageChrome>
  );
}
