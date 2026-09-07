import { db } from "@/lib/db";
import { timetableEvents, tasks, courses } from "@/drizzle/schema";
import { asc, gte, isNull, and, eq, sql } from "drizzle-orm";
import TimetableDashboard from "@/components/TimetableDashboard";
import type { TimetableEvent } from "@/drizzle/schema";

export const dynamic = "force-dynamic";

export default async function TimetablePage() {
  const now = new Date().toISOString();
  const horizon = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();

  let events: TimetableEvent[] = [];
  try {
    events = await db
      .select()
      .from(timetableEvents)
      .where(and(gte(timetableEvents.startAt, now), sql`${timetableEvents.startAt} <= ${horizon}`))
      .orderBy(asc(timetableEvents.startAt));
  } catch {
    // table not yet created
  }

  // Undated pending tasks — used to suggest which tasks need a deadline
  // attached. Doesn't actually assign them; the user does that from the
  // Tasks page via the new "attach timetable deadlines" action.
  let undatedCount = 0;
  try {
    const rows = await db
      .select({ n: sql<number>`count(*)` })
      .from(tasks)
      .where(and(isNull(tasks.dueAt), isNull(tasks.completedAt)));
    undatedCount = Number(rows[0]?.n ?? 0);
  } catch {}

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-6 max-w-2xl mx-auto">
      <nav className="flex gap-2 mb-6">
        <a href="/" className="text-[11px] text-[#6b7280] hover:text-white transition-colors pb-0.5">
          Tasks
        </a>
        <a href="/readings" className="text-[11px] text-[#6b7280] hover:text-white transition-colors pb-0.5">
          Readings
        </a>
        <span className="text-[11px] font-medium text-white border-b border-[#6366f1] pb-0.5">Timetable</span>
      </nav>
      <TimetableDashboard events={events} undatedTaskCount={undatedCount} />
    </main>
  );
}
