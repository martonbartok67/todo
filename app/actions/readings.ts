"use server";
/**
 * 📖 Reading server actions.
 *
 * Includes the existing complete/uncomplete toggles plus the new
 * add/edit/delete actions for the manual reading UI (Step 3).
 */
import { db, dbReady } from "@/lib/db";
import { courses, readingItems } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const REV = ["/", "/readings", "/resources"];

function nowIso() {
  return new Date().toISOString();
}

export async function completeReading(id: number) {
  await db.update(readingItems)
    .set({ completedAt: nowIso(), updatedAt: nowIso() })
    .where(eq(readingItems.id, id));
  revalidatePath("/readings");
}

export async function uncompleteReading(id: number) {
  await db.update(readingItems)
    .set({ completedAt: null, updatedAt: nowIso() })
    .where(eq(readingItems.id, id));
  revalidatePath("/readings");
}

// ── Step 3: manual reading CRUD ──────────────────────────────────────

/** Payload shape for `addManualReading` / `editReading`. */
export type ReadingInput = {
  courseCanvasId: string;
  lectureLabel:   string;
  readingText:    string;
  detail:         string | null;
  weekNumber:     number | null;
  lectureSlot:    "lecture_1" | "lecture_2" | "lecture_3" | "unknown";
};

function validate(input: ReadingInput): string | null {
  if (!input.courseCanvasId) return "Course is required";
  if (!input.lectureLabel.trim()) return "Lecture label is required";
  if (!input.readingText.trim())  return "Reading text is required";
  if (input.weekNumber !== null) {
    if (!Number.isInteger(input.weekNumber)) return "Week must be an integer";
    if (input.weekNumber < 1 || input.weekNumber > 53) return "Week must be 1-53";
  }
  return null;
}

/** Add a manual reading. Looks up the course name for denormalized display. */
export async function addManualReading(input: ReadingInput) {
  const err = validate(input);
  if (err) throw new Error(err);

  
  const courseRows = await db
    .select({ name: courses.name })
    .from(courses)
    .where(eq(courses.canvasId, input.courseCanvasId))
    .limit(1);
  if (courseRows.length === 0) throw new Error("Course not found in local DB");
  const courseName = courseRows[0].name;

  const now = nowIso();
  await db.insert(readingItems).values({
    courseCanvasId: input.courseCanvasId,
    courseName,
    lectureLabel:   input.lectureLabel.trim(),
    readingText:    input.readingText.trim(),
    detail:         input.detail?.trim() || null,
    weekNumber:     input.weekNumber,
    lectureSlot:    input.lectureSlot,
    source:         "manual",
    sourcePageUrl:  null,
    completedAt:    null,
    createdAt:      now,
    updatedAt:      now,
  });

  for (const p of REV) revalidatePath(p);
  return { ok: true };
}

/** Edit an existing reading. Only the user-facing fields can change. */
export async function editReading(id: number, input: ReadingInput) {
  const err = validate(input);
  if (err) throw new Error(err);

  
  const now = nowIso();
  await db.update(readingItems)
    .set({
      lectureLabel: input.lectureLabel.trim(),
      readingText:  input.readingText.trim(),
      detail:       input.detail?.trim() || null,
      weekNumber:   input.weekNumber,
      lectureSlot:  input.lectureSlot,
      updatedAt:    now,
    })
    .where(eq(readingItems.id, id));

  for (const p of REV) revalidatePath(p);
  return { ok: true };
}

/** Delete a reading. No confirmation server-side — the UI handles that. */
export async function deleteReading(id: number) {
  
  await db.delete(readingItems).where(eq(readingItems.id, id));
  for (const p of REV) revalidatePath(p);
  return { ok: true };
}
