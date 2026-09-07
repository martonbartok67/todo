"use server";

/**
 * 🤖 Server actions for triggering AI classification.
 *
 * Step 2 ships the classifier behind a `/api/sync?phase=classify`
 * HTTP endpoint (callable from cron). This server action wraps that
 * logic so the UI can trigger a per-course classification pass without
 * needing to know about CRON secrets or fetch URLs.
 */
import { revalidatePath } from "next/cache";
import { runClassifyForCourse } from "@/lib/canvas/sync";

export type ClassifyActionResult = {
  status:            "success" | "skipped" | "error";
  courseId:          string;
  courseName:        string;
  itemsClassified:   number;
  itemsFlaggedInfo:  number;
  durationMs:        number;
  error?:            string;
};

/**
 * Classify every unclassified task for one course.
 *
 * Returns the same shape as `runClassifyForCourse` so the UI can
 * surface counts and status to the user.
 */
export async function classifyCourseAction(
  courseId: string,
  options: { force?: boolean } = {},
): Promise<ClassifyActionResult> {
  const result = await runClassifyForCourse(courseId, { force: options.force ?? false });

  // Invalidate every page that reads the task list — Tasks, Subject
  // pages, and the notification bell API all need fresh data.
  revalidatePath("/");
  revalidatePath("/resources");
  revalidatePath(`/subjects/${courseId}`);

  return {
    status:           result.status,
    courseId:         result.courseId,
    courseName:       result.courseName,
    itemsClassified:  result.itemsClassified,
    itemsFlaggedInfo: result.itemsFlaggedInfo,
    durationMs:       result.durationMs,
    error:            result.error,
  };
}
