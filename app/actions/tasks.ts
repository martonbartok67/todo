"use server";
/**
 * Server Actions for local task state mutations.
 * ALL writes go to Turso only — nothing is sent back to Canvas.
 */
import { db } from "@/lib/db";
import { tasks } from "@/drizzle/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

/** Mark a task complete (idempotent). */
export async function completeTask(taskId: number) {
  await db
    .update(tasks)
    .set({ completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(tasks.id, taskId));
  revalidatePath("/");
}

/** Undo completion. */
export async function uncompleteTask(taskId: number) {
  await db
    .update(tasks)
    .set({ completedAt: null, updatedAt: new Date().toISOString() })
    .where(eq(tasks.id, taskId));
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
