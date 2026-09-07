import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  if (
    (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) &&
    (!secret || secret !== process.env.CRON_SECRET)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = {
    TURSO_DATABASE_URL:  !!process.env.TURSO_DATABASE_URL,
    TURSO_AUTH_TOKEN:    !!process.env.TURSO_AUTH_TOKEN,
    CANVAS_BASE_URL:     !!process.env.CANVAS_BASE_URL,
    CANVAS_BEARER_TOKEN: !!process.env.CANVAS_BEARER_TOKEN,
    GROQ_API_KEY:        !!process.env.GROQ_API_KEY,
    CRON_SECRET:         !!process.env.CRON_SECRET,
  };

  let dbStatus: Record<string, unknown> = { connected: false };
  try {
    const { db }                    = await import("@/lib/db");
    const { syncLog, readingItems, timetableEvents, courses, tasks } = await import("@/drizzle/schema");
    const { desc, asc, eq, isNull, and, sql } = await import("drizzle-orm");

    const lastSync     = await db.select().from(syncLog).orderBy(desc(syncLog.startedAt)).limit(1);
    const readingCheck = await db.select().from(readingItems).limit(1).catch(() => null);

    // Diagnostic: how well did the iCal sync match events to courses?
    // Most useful right after pasting a feed URL.
    const icalEvents = await db
      .select({
        canvasId:    timetableEvents.canvasId,
        courseCanvasId: timetableEvents.courseCanvasId,
        courseName:  timetableEvents.courseName,
        title:       timetableEvents.title,
        startAt:     timetableEvents.startAt,
      })
      .from(timetableEvents)
      .where(eq(timetableEvents.source, "ical"))
      .orderBy(asc(timetableEvents.startAt))
      .limit(10);

    const icalMatched    = icalEvents.filter((e) => e.courseCanvasId).length;
    const icalUnmatched  = icalEvents.length - icalMatched;
    const icalUnmatchedSamples = icalEvents
      .filter((e) => !e.courseCanvasId)
      .slice(0, 5)
      .map((e) => e.title);

    // Course codes from the courses table so we can see what we'd
    // match against.
    const courseCodes = await db
      .select({ id: courses.canvasId, name: courses.name, code: courses.courseCode })
      .from(courses);

    // Sample of undated tasks grouped by course.
    const undatedByCourse = await db
      .select({
        courseCanvasId: tasks.courseCanvasId,
        n: sql<number>`count(*)`,
      })
      .from(tasks)
      .where(and(isNull(tasks.dueAt), isNull(tasks.completedAt)))
      .groupBy(tasks.courseCanvasId);

    dbStatus = {
      connected:               true,
      lastSync:                lastSync[0] ?? null,
      readingItemsTableExists: readingCheck !== null,
      readingItemsHasRows:     (readingCheck ?? []).length > 0,
      ical: {
        totalSample:  icalEvents.length,
        matched:      icalMatched,
        unmatched:    icalUnmatched,
        unmatchedTitles: icalUnmatchedSamples,
      },
      courseCodes: courseCodes.map((c) => ({ canvasId: c.id, name: c.name, code: c.code })),
      undatedByCourse,
    };
  } catch (err) {
    dbStatus = { connected: false, error: String(err) };
  }

  return NextResponse.json({ env, db: dbStatus });
}
