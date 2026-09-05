/**
 * Server-side Web Push sender.
 * Skeleton ready — full dispatch logic in Step 5.
 */
import webpush from "web-push";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

export type PushPayload = {
  title: string;
  body:  string;
  url?:  string;
};

let vapidConfigured = false;

/**
 * Configure VAPID keys lazily — only when a push is actually sent.
 * Doing this here (instead of at module load) means an unconfigured
 * deployment still imports cleanly; the error only fires when
 * `broadcastPush` is called, with a readable message.
 */
function ensureVapidConfigured(): void {
  if (vapidConfigured) return;

  const subject    = process.env.VAPID_SUBJECT;
  const publicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const missing = [
    !subject    && "VAPID_SUBJECT",
    !publicKey  && "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    !privateKey && "VAPID_PRIVATE_KEY",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    throw new Error(
      `Push notifications unavailable: missing env var(s): ${missing.join(", ")}. ` +
      `Run \`npx web-push generate-vapid-keys\` and add them to Vercel.`
    );
  }

  webpush.setVapidDetails(subject!, publicKey!, privateKey!);
  vapidConfigured = true;
}

/**
 * Send a push notification to ALL registered subscriptions.
 * Stale subscriptions (410 Gone) are automatically removed.
 */
export async function broadcastPush(payload: PushPayload): Promise<void> {
  ensureVapidConfigured();

  const subs = await db.select().from(pushSubscriptions);

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
          },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        // 410 = subscription expired; remove it
        if (
          err &&
          typeof err === "object" &&
          "statusCode" in err &&
          (err as { statusCode: number }).statusCode === 410
        ) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.endpoint, sub.endpoint));
        }
      }
    })
  );
}
