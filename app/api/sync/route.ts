/**
 * POST /api/sync — full Canvas sync
 * GET  /api/sync?secret=X — same, callable from browser for debugging
 */
import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/canvas/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secretParam = req.nextUrl.searchParams.get("secret");
  const secret = process.env.CRON_SECRET;

  const authorized =
    (authHeader && secret && authHeader === `Bearer ${secret}`) ||
    (secretParam && secret && secretParam === secret);

  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSync();

  // After sync, auto-attach timetable deadlines to undated tasks
  let deadlineResult: { matched: number; skipped: number; noEvents: number } | null = null;
  try {
    const { attachTimetableDeadlines } = await import("@/app/actions/timetable");
    deadlineResult = await attachTimetableDeadlines();
  } catch (err) {
    console.error("attachTimetableDeadlines failed (non-fatal):", err);
  }

  return NextResponse.json(
    { ...result, deadlines: deadlineResult },
    { status: result.status === "error" ? 500 : 200 }
  );
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest)  { return handle(req); }
