/**
 * POST /api/sync
 * Triggered by GitHub Actions on a daily cron (.github/workflows/sync.yml).
 * Also callable manually with the correct CRON_SECRET header.
 *
 * Security: every caller must send Authorization: Bearer <CRON_SECRET>.
 * Never expose this route without the secret check.
 *
 * Vercel just hosts the endpoint — the actual cron scheduling lives in
 * GitHub Actions, which has no 10s serverless ceiling. This lets AI reading
 * extraction complete in a single pass instead of being time-budgeted.
 */
import { NextRequest, NextResponse } from "next/server";
import { dbReady } from "@/lib/db";
import { runSync } from "@/lib/canvas/sync";

export const runtime = "nodejs"; // needs Node APIs (fetch, crypto)
export const maxDuration = 60;   // honored on Pro; Vercel Hobby still caps at 10s — irrelevant since the GitHub Actions runner is the long-lived caller

export async function POST(req: NextRequest) {
  const auth       = req.headers.get("authorization");
  const secret     = process.env.CRON_SECRET;
  const triggeredBy = req.headers.get("cron-triggered-by") ?? "manual";

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Log the trigger source so we can tell GitHub Actions from a manual curl
  // when triaging failures in Vercel's function logs.
  console.log(`[sync] triggered_by=${triggeredBy}`);

  // Ensure schema is bootstrapped before any writes — first request to a
  // fresh DB would otherwise race the background ensureSchema() and hit
  // "no such table: courses". Safe on subsequent calls (cached promise).
  await dbReady();

  const result = await runSync();

  // Always 200 for status="partial" — partial just means some readings were
  // deferred, which is now rare since we removed the time budget.
  const status = result.status === "error" ? 500 : 200;
  return NextResponse.json(result, { status });
}

// Also allow GET so any plain HTTP pinger (e.g. cron-job.org) works too.
export async function GET(req: NextRequest) {
  return POST(req);
}