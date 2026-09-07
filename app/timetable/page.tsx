import { db, dbReady } from "@/lib/db";
import { timetableEvents, tasks, courses, userSettings } from "@/drizzle/schema";
import { asc, gte, isNull, and, eq, sql } from "drizzle-orm";
import TimetableDashboard from "@/components/TimetableDashboard";
import { PageChrome } from "@/components/PageChrome";
import type { TimetableEvent } from "@/drizzle/schema";

export const dynamic = "force-dynamic";

export default async function TimetablePage() {
  // Make sure schema is bootstrapped (new columns + indexes applied) before
  // any read query. Without this, the very first request after a deploy
  // races with the background ensureSchema() and hits "no such column".
  await dbReady();
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

  // Current iCal configuration (if any)
  let icalUrl: string | null = null;
  let icalLabel: string | null = null;
  try {
    const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1);
    icalUrl   = rows[0]?.icalUrl   ?? null;
    icalLabel = rows[0]?.icalLabel ?? null;
  } catch {}

  return (
    <PageChrome active="timetable">
      <TimetableDashboard
        events={events}
        undatedTaskCount={undatedCount}
        icalUrl={icalUrl}
        icalLabel={icalLabel}
      />
    </PageChrome>
  );
}
