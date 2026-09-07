import { db, dbReady } from "@/lib/db";
import { courses, readingItems } from "@/drizzle/schema";
import { asc } from "drizzle-orm";
import ReadingsDashboard from "@/components/ReadingsDashboard";
import { PageChrome } from "@/components/PageChrome";
import type { ReadingItem } from "@/drizzle/schema";

export const dynamic = "force-dynamic";

export default async function ReadingsPage() {
  // Make sure schema is bootstrapped (new columns + indexes applied) before
  // any read query. Without this, the very first request after a deploy
  // races with the background ensureSchema() and hits "no such column".
  await dbReady();
  let items: ReadingItem[] = [];
  let courseList: Array<{ canvasId: string; name: string }> = [];
  try {
    items = await db.select().from(readingItems).orderBy(
      asc(readingItems.courseCanvasId),
      asc(readingItems.lectureLabel),
      asc(readingItems.readingText),
    );
    courseList = await db
      .select({ canvasId: courses.canvasId, name: courses.name })
      .from(courses)
      .orderBy(asc(courses.name));
  } catch {
    // Table not yet created — remind user to run db:push
  }

  return (
    <PageChrome active="readings">
      <ReadingsDashboard
        items={items}
        courses={courseList}
        tableReady={items !== null}
      />
    </PageChrome>
  );
}
