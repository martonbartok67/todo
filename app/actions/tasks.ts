"use server";
/**
 * Server Actions for local task state mutations.
 * ALL writes go to Turso only — nothing is sent back to Canvas.
 */
import { db } from "@/lib/db";
import { tasks } from "@/drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/**
 * Mark a task complete (idempotent).
 *
 * `alsoIds` are the unit satellites this row absorbed (see
 * lib/unit-rollup.ts). They have to travel with the tick, not just for
 * tidiness: the roll-up only hides a clip while its unit row is in the
 * pending list, so completing the unit alone would drop the unit out of
 * that list and pop all of its clips back in as separate tasks.
 */
export async function completeTask(taskId: number, alsoIds: number[] = []) {
  const ids = [taskId, ...alsoIds.filter((id) => id !== taskId)];
  await db
    .update(tasks)
    .set({ completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(ids.length === 1 ? eq(tasks.id, taskId) : inArray(tasks.id, ids));
  revalidatePath("/");
}

/**
 * Undo completion. `alsoIds` mirrors completeTask — note that a row
 * un-ticked from the completed list carries none, because the roll-up
 * runs over pending rows only: its satellites stay complete, which is
 * harmless (they simply stay out of the list) and reversible one by one
 * from the completed section.
 */
export async function uncompleteTask(taskId: number, alsoIds: number[] = []) {
  const ids = [taskId, ...alsoIds.filter((id) => id !== taskId)];
  await db
    .update(tasks)
    .set({ completedAt: null, updatedAt: new Date().toISOString() })
    .where(ids.length === 1 ? eq(tasks.id, taskId) : inArray(tasks.id, ids));
  revalidatePath("/");
}

/** Snooze a task until a given UTC ISO timestamp. */
export async function snoozeTask(taskId: number, until: string) {
  await db
    .update(tasks)
    .set({ snoozedUntil: until, updatedAt: new Date().toISOString() })
    .where(eq(tasks.id, taskId));
  revalidatePath("/");
}

/** Clear snooze. */
export async function unsnoozeTask(taskId: number) {
  await db
    .update(tasks)
    .set({ snoozedUntil: null, updatedAt: new Date().toISOString() })
    .where(eq(tasks.id, taskId));
  revalidatePath("/");
}
