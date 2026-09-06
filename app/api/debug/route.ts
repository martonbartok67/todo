import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
    const { syncLog, readingItems } = await import("@/drizzle/schema");
    const { desc }                  = await import("drizzle-orm");

    const lastSync     = await db.select().from(syncLog).orderBy(desc(syncLog.startedAt)).limit(1);
    const readingCheck = await db.select().from(readingItems).limit(1).catch(() => null);

    dbStatus = {
      connected:               true,
      lastSync:                lastSync[0] ?? null,
      readingItemsTableExists: readingCheck !== null,
      readingItemsHasRows:     (readingCheck ?? []).length > 0,
    };
  } catch (err) {
    dbStatus = { connected: false, error: String(err) };
  }

  return NextResponse.json({ env, db: dbStatus });
}
