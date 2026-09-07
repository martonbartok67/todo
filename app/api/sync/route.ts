/**
 * POST /api/sync                       — full sync (will likely hit Vercel Hobby 60s cap)
 * POST /api/sync?phase=tasks            — pull courses + tasks only (fast, ~10-15s)
 * POST /api/sync?phase=ai&courseId=…   — extract readings for one course
 * GET  /api/sync?secret=…              — verbose diagnostic mode (browser test)
 */
import { NextRequest, NextResponse } from "next/server";
import { runSync, runTaskSync, runAIForCourse } from "@/lib/canvas/sync";
import { dbReady } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Pro honors this (up to 300s); Hobby hard-caps at 60s

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function handlePost(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return unauthorized();
  }

  const phase    = req.nextUrl.searchParams.get("phase") ?? "full";
  const courseId = req.nextUrl.searchParams.get("courseId");
  console.log(`[sync] phase=${phase} courseId=${courseId ?? "-"}`);

  // Ensure schema is bootstrapped before any writes — first request to a
  // fresh DB would otherwise race the background ensureSchema() and hit
  // "no such table: courses". Safe on subsequent calls (cached promise).
  await dbReady();

  if (phase === "tasks") {
    const result = await runTaskSync();
    return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
  }

  if (phase === "ai") {
    if (!courseId) {
      return NextResponse.json({ error: "phase=ai requires ?courseId=<id>" }, { status: 400 });
    }
    const offsetRaw = req.nextUrl.searchParams.get("offset");
    const limitRaw  = req.nextUrl.searchParams.get("limit");
    const offset = offsetRaw !== null ? Math.max(0, parseInt(offsetRaw, 10) || 0) : 0;
    const limit  = limitRaw  !== null ? Math.max(1, Math.min(100, parseInt(limitRaw, 10) || 20)) : 20;
    const result = await runAIForCourse(courseId, { offset, limit });
    // 200 even on per-course "error"/"skipped" so the workflow can keep
    // iterating through remaining courses. The body says what happened.
    return NextResponse.json(result, { status: 200 });
  }

  if (phase === "full") {
    const result = await runSync();
    return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
  }

  return NextResponse.json(
    { error: `Unknown phase "${phase}". Use one of: tasks, ai, full.` },
    { status: 400 }
  );
}

export async function POST(req: NextRequest) {
  return handlePost(req);
}

/**
 * GET /api/sync?secret=X — diagnostic mode for testing from a browser.
 * Always runs the full sync (no phase param). Useful for quickly triaging
 * the readings pipeline without hitting the GitHub Actions runner.
 */
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return unauthorized();
  }
  await dbReady();
  const result = await runSync();
  return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
}
