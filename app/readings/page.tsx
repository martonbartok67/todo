import { db } from "@/lib/db";
import { readingItems } from "@/drizzle/schema";
import { asc } from "drizzle-orm";
import ReadingsDashboard from "@/components/ReadingsDashboard";
import type { ReadingItem } from "@/drizzle/schema";

export const dynamic = "force-dynamic";

export default async function ReadingsPage() {
  let items: ReadingItem[] = [];
  try {
    items = await db.select().from(readingItems).orderBy(
      asc(readingItems.courseCanvasId),
      asc(readingItems.lectureLabel),
      asc(readingItems.readingText),
    );
  } catch {
    // Table not yet created — remind user to run db:push
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-6 max-w-2xl mx-auto">
      <nav className="flex gap-2 mb-6">
        <a href="/" className="text-[11px] text-[#6b7280] hover:text-white transition-colors pb-0.5">
          Tasks
        </a>
        <span className="text-[11px] font-medium text-white border-b border-[#6366f1] pb-0.5">Readings</span>
        <a href="/timetable" className="text-[11px] text-[#6b7280] hover:text-white transition-colors pb-0.5">
          Timetable
        </a>
      </nav>
      <ReadingsDashboard items={items} tableReady={items !== null} />
    </main>
  );
}
