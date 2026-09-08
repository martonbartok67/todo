/**
 * POST /api/sync?phase=tasks|ai|timetable|ical|classify
 *
 * phase=tasks    — sync courses + tasks (fast, no AI, returns courseIds)
 * phase=ai       — extract readings for one course (?courseId=X&offset=N&limit=20)
 * phase=timetable — sync Canvas calendar events (?weeks=4)
 * phase=ical     — sync iCal feed from user_settings
 * phase=classify — AI-classify unclassified tasks for one course (?courseId=X)
 *
 * All phases accept GET with ?secret= for browser testing.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime  = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  const param  = req.nextUrl.searchParams.get("secret");
  return header === `Bearer ${secret}` || param === secret;
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req:  NextRequest) { return handle(req); }

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const p          = req.nextUrl.searchParams;
  const phase      = p.get("phase") ?? "tasks";
  const courseId   = p.get("courseId") ?? "";
  const offset     = parseInt(p.get("offset") ?? "0", 10);
  const limit      = parseInt(p.get("limit")  ?? "20", 10);
  const weeks      = parseInt(p.get("weeks")  ?? "4",  10);

  try {
    switch (phase) {

      case "tasks": {
        const { runTaskSync } = await import("@/lib/canvas/sync");
        const result = await runTaskSync();
        return NextResponse.json(result,
          { status: result.status === "error" ? 500 : 200 });
      }

      case "ai": {
        if (!courseId) {
          return NextResponse.json({ error: "courseId required" }, { status: 400 });
        }
        const { runAIForCourse } = await import("@/lib/canvas/sync");
        const result = await runAIForCourse(courseId, { offset, limit });
        // Always 200 so workflow continues to next course
        return NextResponse.json(result, { status: 200 });
      }

      case "timetable": {
        const { runTimetableSync } = await import("@/lib/canvas/sync");
        const result = await runTimetableSync({ weeks });
        return NextResponse.json(result, { status: 200 });
      }

      case "ical": {
        const { runIcalSync } = await import("@/lib/canvas/sync");
        const result = await runIcalSync();
        return NextResponse.json(result, { status: 200 });
      }

      case "classify": {
        if (!courseId) {
          return NextResponse.json({ error: "courseId required" }, { status: 400 });
        }
        const { runClassifyForCourse } = await import("@/lib/canvas/sync");
        const result = await runClassifyForCourse(courseId);
        // Always 200 so workflow continues to next course
        return NextResponse.json(result, { status: 200 });
      }

      default:
        return NextResponse.json({ error: `Unknown phase: ${phase}` }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sync] phase=${phase} error:`, message);
    return NextResponse.json({ error: message, phase }, { status: 500 });
  }
}
