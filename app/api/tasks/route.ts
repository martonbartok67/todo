/**
 * GET /api/tasks
 * Query params:
 *   ?filter=pending|completed|upcoming   (default: pending)
 *
 * Returns JSON array of EnrichedTask.
 * Used by client components that need fresh data without a full page reload.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  getPendingTasks,
  getCompletedTasks,
  getUpcomingDeadlines,
} from "@/lib/tasks";
import { dbReady } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // never cache — always live

export async function GET(req: NextRequest) {
  const filter = req.nextUrl.searchParams.get("filter") ?? "pending";

  try {
    // Make sure schema is bootstrapped (new columns + indexes applied)
    // before any read query. Without this, the very first request after
    // a deploy races with the background ensureSchema() and hits
    // "no such column".
    await dbReady();
    let data;
    if (filter === "completed") {
      data = await getCompletedTasks();
    } else if (filter === "upcoming") {
      data = await getUpcomingDeadlines();
    } else {
      data = await getPendingTasks();
    }
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
