import { db } from "@/lib/db";
import { readingItems } from "@/drizzle/schema";
import { asc } from "drizzle-orm";
import ReadingsDashboard from "@/components/ReadingsDashboard";

export const dynamic = "force-dynamic";

export default async function ReadingsPage() {
  const items = await db.select().from(readingItems).orderBy(
    asc(readingItems.courseCanvasId),
    asc(readingItems.lectureLabel),
    asc(readingItems.readingText),
  );
  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-6 max-w-2xl mx-auto">
      <ReadingsDashboard items={items} />
    </main>
  );
}
