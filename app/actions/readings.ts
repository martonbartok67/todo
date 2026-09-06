"use server";
import { db } from "@/lib/db";
import { readingItems } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function completeReading(id: number) {
  await db.update(readingItems)
    .set({ completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(readingItems.id, id));
  revalidatePath("/readings");
}

export async function uncompleteReading(id: number) {
  await db.update(readingItems)
    .set({ completedAt: null, updatedAt: new Date().toISOString() })
    .where(eq(readingItems.id, id));
  revalidatePath("/readings");
}
