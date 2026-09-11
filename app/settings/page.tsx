import { PageChrome } from "@/components/PageChrome";
import { SettingsClient } from "@/components/SettingsClient";
import { db } from "@/lib/db";
import { userSettings, courses, syncLog } from "@/drizzle/schema";
import { eq, desc, notInArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

const SKIP = ["43161", "56744", "56741", "42446"];

export default async function SettingsPage() {
  let icalUrl:   string | null = null;
  let icalLabel: string | null = null;
  let courseList: { canvasId: string; name: string; code: string | null }[] = [];
  let lastSync: { startedAt: string; status: string; tasksUpserted: number } | null = null;

  try {
    const [settingsRows, courseRows, syncRows] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
      db.select({ canvasId: courses.canvasId, name: courses.name, code: courses.courseCode })
        .from(courses)
        .where(notInArray(courses.canvasId, SKIP))
        .orderBy(courses.name),
      db.select().from(syncLog).orderBy(desc(syncLog.startedAt)).limit(1),
    ]);
    icalUrl   = settingsRows[0]?.icalUrl   ?? null;
    icalLabel = settingsRows[0]?.icalLabel ?? null;
    courseList = courseRows;
    lastSync   = syncRows[0] ?? null;
  } catch {}

  return (
    <PageChrome active="settings">
      <SettingsClient
        icalUrl={icalUrl}
        icalLabel={icalLabel}
        courses={courseList}
        lastSync={lastSync}
      />
    </PageChrome>
  );
}
