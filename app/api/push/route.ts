/**
 * POST /api/push/subscribe   — register a browser push subscription
 * DELETE /api/push/subscribe — remove a subscription (user revokes permission)
 *
 * Body: { endpoint, keys: { p256dh, auth }, userAgent? }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      endpoint:  string;
      keys:      { p256dh: string; auth: string };
      userAgent?: string;
    };

    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
    }

    await db
      .insert(pushSubscriptions)
      .values({
        endpoint:  body.endpoint,
        p256dhKey: body.keys.p256dh,
        authKey:   body.keys.auth,
        userAgent: body.userAgent ?? req.headers.get("user-agent") ?? null,
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing(); // already registered — no-op

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = await req.json() as { endpoint: string };
    if (!endpoint) {
      return NextResponse.json({ error: "endpoint required" }, { status: 400 });
    }
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
