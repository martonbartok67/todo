/**
 * POST /api/sync
 * Triggered by Vercel Cron every 6 hours (vercel.json).
 * Also callable manually with the correct CRON_SECRET header.
 *
 * Security: Vercel Cron sends Authorization: Bearer <CRON_SECRET>.
 * Never expose this route without the secret check.
 */
import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/canvas/sync";

export const runtime = "nodejs"; // needs Node APIs (fetch, crypto)
export const maxDuration = 60;   // Vercel hobby limit

export async function POST(req: NextRequest) {
  const auth   = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSync();

  const status = result.status === "error" ? 500 : 200;
  return NextResponse.json(result, { status });
}

// Also allow GET so Vercel Cron (which sends GET) works out of the box
export async function GET(req: NextRequest) {
  return POST(req);
}
