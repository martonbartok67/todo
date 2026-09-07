"use client";

/**
 * 📑 ReadingSheet — a slide-in side panel for adding/editing a reading.
 *
 * Used by `ReadingsDashboard` for both flows:
 *   • Add:    open from the "+ Add reading" button. Reading arg is null.
 *   • Edit:   open from the row's pencil icon. Reading arg is the row.
 *
 * Renders as a right-side overlay (fixed, full height) with a backdrop.
 * The form submits to the matching server action and closes on success.
 */
import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  addManualReading,
  editReading,
  deleteReading,
  type ReadingInput,
} from "@/app/actions/readings";
import type { ReadingItem } from "@/drizzle/schema";

export type SheetReading = ReadingItem;

const LECTURE_SLOTS: { value: "lecture_1" | "lecture_2" | "lecture_3" | "unknown"; label: string }[] = [
  { value: "lecture_1", label: "Lecture 1" },
  { value: "lecture_2", label: "Lecture 2" },
  { value: "lecture_3", label: "Lecture 3" },
  { value: "unknown",  label: "Unknown / N/A" },
];

export function ReadingSheet({
  mode, reading, courses, onClose,
}: {
  mode:     "add" | "edit";
  reading:  SheetReading | null;
  courses:  Array<{ canvasId: string; name: string }>;
  onClose:  () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Initial form state. For "add" we prefill the course selector to the
  // first course so the form is never in a "missing required field"
  // state on first render. For "edit" we copy from the row.
  const [courseCanvasId, setCourseCanvasId] = useState(
    reading?.courseCanvasId ?? courses[0]?.canvasId ?? ""
  );
  const [lectureLabel, setLectureLabel] = useState(reading?.lectureLabel ?? "");
  const [readingText,  setReadingText]  = useState(reading?.readingText  ?? "");
  const [detail,       setDetail]       = useState(reading?.detail        ?? "");
  const [weekNumber,   setWeekNumber]   = useState<string>(
    reading?.weekNumber != null ? String(reading.weekNumber) : ""
  );
  const [lectureSlot, setLectureSlot] = useState<ReadingInput["lectureSlot"]>(
    (reading?.lectureSlot as ReadingInput["lectureSlot"]) ?? "unknown"
  );

  // Esc closes the sheet.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function buildInput(): ReadingInput | null {
    const wn = weekNumber.trim() === "" ? null : Number(weekNumber);
    if (wn !== null && !Number.isInteger(wn)) {
      setError("Week must be an integer (or blank).");
      return null;
    }
    return {
      courseCanvasId,
      lectureLabel: lectureLabel.trim(),
      readingText:  readingText.trim(),
      detail:       detail.trim() || null,
      weekNumber:   wn,
      lectureSlot,
    };
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const input = buildInput();
    if (!input) return;
    startTransition(async () => {
      try {
        if (mode === "add") {
          await addManualReading(input);
        } else if (mode === "edit" && reading) {
          await editReading(reading.id, input);
        }
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function handleDelete() {
    if (!reading) return;
    if (!confirm("Delete this reading? This can't be undone.")) return;
    startTransition(async () => {
      try {
        await deleteReading(reading.id);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  const isEdit = mode === "edit";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/40"
          aria-hidden
        />
        {/* Panel */}
        <motion.aside
          role="dialog"
          aria-label={isEdit ? "Edit reading" : "Add reading"}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
          className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-background border-l border-border shadow-xl flex flex-col"
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight">
              {isEdit ? "Edit reading" : "Add reading"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted hover:text-foreground transition-colors text-base leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-surface-1"
            >
              ×
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Course */}
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-muted font-medium mb-1.5">
                Course
              </label>
              <select
                value={courseCanvasId}
                onChange={(e) => setCourseCanvasId(e.target.value)}
                disabled={isEdit}  // can't move a reading between courses
                className="w-full text-[13px] bg-surface-1 border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-foreground transition-colors disabled:opacity-60"
              >
                {courses.length === 0 && <option value="">(no courses yet)</option>}
                {courses.map((c) => (
                  <option key={c.canvasId} value={c.canvasId}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Lecture label */}
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-muted font-medium mb-1.5">
                Lecture label
              </label>
              <input
                type="text"
                value={lectureLabel}
                onChange={(e) => setLectureLabel(e.target.value)}
                placeholder="e.g. Week 36 — Lecture 1"
                className="w-full text-[13px] bg-surface-1 border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-foreground transition-colors"
              />
            </div>

            {/* Reading text */}
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-muted font-medium mb-1.5">
                Reading
              </label>
              <input
                type="text"
                value={readingText}
                onChange={(e) => setReadingText(e.target.value)}
                placeholder="e.g. Chapter 4 — Market Structures"
                className="w-full text-[13px] bg-surface-1 border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-foreground transition-colors"
              />
            </div>

            {/* Detail */}
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-muted font-medium mb-1.5">
                Detail <span className="text-muted/60 normal-case">(optional)</span>
              </label>
              <input
                type="text"
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="e.g. pages 23-45, or a topic note"
                className="w-full text-[13px] bg-surface-1 border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-foreground transition-colors"
              />
            </div>

            {/* Week + lecture slot */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-muted font-medium mb-1.5">
                  Week <span className="text-muted/60 normal-case">(optional)</span>
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="53"
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(e.target.value)}
                  placeholder="1-53"
                  className="w-full text-[13px] tabular-nums bg-surface-1 border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-foreground transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-muted font-medium mb-1.5">
                  Lecture slot
                </label>
                <select
                  value={lectureSlot}
                  onChange={(e) => setLectureSlot(e.target.value as ReadingInput["lectureSlot"])}
                  className="w-full text-[13px] bg-surface-1 border border-border rounded-lg px-3 py-2 focus:outline-none focus:border-foreground transition-colors"
                >
                  {LECTURE_SLOTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <p className="text-[12px] text-[#ef4444]">{error}</p>
            )}
          </form>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-border flex items-center gap-2">
            {isEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="text-[12px] text-[#ef4444] hover:text-background hover:bg-[#ef4444] disabled:opacity-40 transition-colors rounded-lg px-3 py-1.5"
              >
                Delete
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="text-[12px] text-muted hover:text-foreground disabled:opacity-40 transition-colors rounded-lg px-3 py-1.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isPending || !courseCanvasId || !lectureLabel.trim() || !readingText.trim()}
              className="text-[12px] text-background bg-foreground hover:opacity-80 disabled:opacity-40 transition-opacity rounded-lg px-3 py-1.5 font-medium"
            >
              {isPending ? "Saving…" : isEdit ? "Save" : "Add"}
            </button>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
