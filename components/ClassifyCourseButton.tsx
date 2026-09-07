"use client";

/**
 * 🤖 ClassifyCourseButton — triggers AI classification for one course.
 *
 * A small button the user clicks to run `runClassifyForCourse` for the
 * current course. Shows a count of how many items were flagged as
 * "info" after a successful run.
 *
 * Used on:
 *   • Tasks page  — per-course (inside the Subject view)
 *   • Subject page — top-right of the header
 *
 * The button is disabled while a run is in flight (useTransition) so
 * the user can't double-fire and trip Groq's rate limits.
 */
import { useState, useTransition } from "react";
import { classifyCourseAction, type ClassifyActionResult } from "@/app/actions/classify";

export function ClassifyCourseButton({
  courseId,
  courseName,
  variant = "inline",
}: {
  courseId:   string;
  courseName: string;
  variant?:   "inline" | "header";
}) {
  const [isPending, startTransition] = useTransition();
  const [result,    setResult]       = useState<ClassifyActionResult | null>(null);

  function handleClick() {
    startTransition(async () => {
      const r = await classifyCourseAction(courseId, { force: false });
      setResult(r);
    });
  }

  // ── variants ──────────────────────────────────────────────────────────
  // - "inline"  → small pill used inside the Subject view on Tasks page
  // - "header"  → slightly bigger, used on the Subject detail page header
  const baseClasses = variant === "header"
    ? "px-3 py-1.5 text-[11px] font-medium rounded-lg border transition-colors"
    : "px-2 py-1 text-[10px] font-medium rounded-md border transition-colors";

  return (
    <div className={variant === "header" ? "flex items-center gap-2 flex-wrap" : ""}>
      <button
        disabled={isPending}
        onClick={handleClick}
        className={[
          baseClasses,
          isPending
            ? "border-border bg-surface-1 text-muted cursor-not-allowed"
            : "border-border bg-surface-1 text-foreground hover:bg-surface-2",
        ].join(" ")}
        aria-label={`Run AI classification for ${courseName}`}
      >
        {isPending
          ? "Classifying…"
          : result
            ? "Re-classify"
            : variant === "header"
              ? "Run AI classification"
              : "AI classify"}
      </button>

      {result && !isPending && (
        <span className={[
          "text-[10px] tabular-nums",
          result.status === "error" ? "text-[#ef4444]" : "text-muted",
        ].join(" ")}>
          {result.status === "success" && result.itemsClassified === 0 && (
            <>No unclassified items.</>
          )}
          {result.status === "success" && result.itemsClassified > 0 && (
            <>
              Classified {result.itemsClassified} ·{" "}
              {result.itemsFlaggedInfo > 0 ? (
                <span className="text-foreground/80">
                  {result.itemsFlaggedInfo} flagged as info
                </span>
              ) : (
                "all kept as tasks"
              )}
            </>
          )}
          {result.status === "skipped" && (
            <>Skipped{result.error ? `: ${result.error}` : ""}.</>
          )}
          {result.status === "error" && (
            <>Error: {result.error ?? "unknown"}</>
          )}
        </span>
      )}
    </div>
  );
}
