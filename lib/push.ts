/**
 * Server-side Web Push sender.
 * Skeleton ready — full dispatch logic in Step 5.
 */
import webpush from "web-push";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/drizzle/schema";
import { eq } from "drizzle-orm";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export type PushPayload = {
  title: string;
  body:  string;
  url?:  string;
};

/**
 * Send a push notification to ALL registered subscriptions.
 * Stale subscriptions (410 Gone) are automatically removed.
 */
export async function broadcastPush(payload: PushPayload): Promise<void> {
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
