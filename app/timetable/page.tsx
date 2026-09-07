import { db } from "@/lib/db";
import { timetableEvents, tasks, userSettings } from "@/drizzle/schema";
import { asc, gte, isNull, and, eq, sql } from "drizzle-orm";
import TimetableDashboard from "@/components/TimetableDashboard";
import { PageChrome } from "@/components/PageChrome";
import type { TimetableEvent } from "@/drizzle/schema";

export const dynamic = "force-dynamic";

export default async function TimetablePage() {
  const now     = new Date().toISOString();
  const horizon = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString();

  let events: TimetableEvent[] = [];
  let undatedCount = 0;
  let icalUrl: string | null   = null;
  let icalLabel: string | null = null;

  try {
    events = await db.select().from(timetableEvents)
      .where(and(gte(timetableEvents.startAt, now), sql\`\${timetableEvents.startAt} <= \${horizon}\`))
      .orderBy(asc(timetableEvents.startAt));
  } catch {}

  try {
    const rows = await db.select({ n: sql<number>\`count(*)\` }).from(tasks)
      .where(and(isNull(tasks.dueAt), isNull(tasks.completedAt)));
    undatedCount = Number(rows[0]?.n ?? 0);
  } catch {}

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
