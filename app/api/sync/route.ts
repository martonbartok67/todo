/**
 * POST /api/sync — Canvas sync + AI reading extraction
 * GET  /api/sync?secret=X — verbose diagnostic mode
 */
import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/canvas/sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSync();
  return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSync();
  return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
}
