/**
 * GET /api/notify-deadlines
 *
 * Sends a push notification for every pending task due within 48h that
 * hasn't been notified about yet, then marks it notified so the next run
 * doesn't repeat it. Intended to run on a schedule (see vercel.json) —
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically,
 * so this accepts that header; the `?secret=` query param is also
 * accepted for manual/external triggering, matching the other cron
 * routes in this app.
 */
import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db, dbReady } from "@/lib/db";
import { tasks } from "@/drizzle/schema";
import { getUpcomingDeadlines } from "@/lib/tasks";
import { broadcastPush } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbReady();

    const upcoming = await getUpcomingDeadlines();
    const unnotified = upcoming.filter((t) => !t.notifiedAt);

    let sent = 0;
    const notifiedIds: number[] = [];
    for (const task of unnotified) {
      try {
        await broadcastPush({
          title: `${task.courseName}`,
          body:  `Due soon: ${task.title}`,
          url:   task.url ?? undefined,
        });
        sent++;
        notifiedIds.push(task.id);
      } catch (e) {
        // A single bad push (e.g. VAPID misconfigured) shouldn't stop the
        // rest of the batch or get retried forever — surface it and move on.
        console.error(`notify-deadlines: failed to push task ${task.id}:`, e);
      }
    }

    if (notifiedIds.length > 0) {
      await db
        .update(tasks)
        .set({ notifiedAt: new Date().toISOString() })
        .where(inArray(tasks.id, notifiedIds));
    }

    return NextResponse.json({
      ok: true,
      checked: upcoming.length,
      alreadyNotified: upcoming.length - unnotified.length,
      sent,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
