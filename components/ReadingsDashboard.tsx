"use client";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  completeReading,
  uncompleteReading,
} from "@/app/actions/readings";
import type { ReadingItem } from "@/drizzle/schema";
import { ReadingRow } from "./ReadingRow";
import { ReadingSheet, type SheetReading } from "./ReadingSheet";

type CourseGroup = {
  courseName:     string;
  courseCanvasId: string;
  lectures:       { label: string; items: ReadingItem[] }[];
};

function groupReadings(items: ReadingItem[]): CourseGroup[] {
  const courseMap = new Map<string, CourseGroup>();
  for (const item of items) {
    if (!courseMap.has(item.courseCanvasId)) {
      courseMap.set(item.courseCanvasId, {
        courseName: item.courseName, courseCanvasId: item.courseCanvasId, lectures: [],
      });
    }
    const course = courseMap.get(item.courseCanvasId)!;
    let lecture  = course.lectures.find((l) => l.label === item.lectureLabel);
    if (!lecture) { lecture = { label: item.lectureLabel, items: [] }; course.lectures.push(lecture); }
    lecture.items.push(item);
  }
  return Array.from(courseMap.values());
}

function fallbackColor(name: string): string {
  const colors = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[Math.abs(h)];
}

export default function ReadingsDashboard({
  items, courses, tableReady,
}: {
  items:     ReadingItem[];
  courses:   Array<{ canvasId: string; name: string }>;
  tableReady: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const groups    = groupReadings(items);
  const doneCount = items.filter((i) => i.completedAt).length;

  // Sheet state. `null` = closed, otherwise the reading being added/edited.
  // `mode` distinguishes add vs edit so the sheet copy + submit button
  // stay accurate.
  const [sheet, setSheet] = useState<{
    mode: "add" | "edit";
    reading: SheetReading | null;
  } | null>(null);

  function handleComplete(id: number)   { startTransition(() => { completeReading(id); }); }
  function handleUncomplete(id: number) { startTransition(() => { uncompleteReading(id); }); }

  return (
    <>
      <header className="flex items-center justify-between mb-5 gap-3">
        <div className="min-w-0">
          <h1 className="text-lg md:text-base font-semibold tracking-tight">Readings</h1>
          <p className="text-xs text-muted mt-0.5 tabular-nums">
            {items.length > 0
              ? `${doneCount}/${items.length} complete · AI-extracted from course manuals`
              : "AI-extracted from course manuals"}
          </p>
        </div>
        <button
          onClick={() => setSheet({ mode: "add", reading: null })}
          className="shrink-0 px-3 py-1.5 text-[11px] font-medium rounded-lg border border-border bg-surface-1 hover:bg-surface-2 transition-colors"
        >
          + Add reading
        </button>
      </header>

      {/* Table not ready */}
      {!tableReady && (
        <div className="rounded-xl bg-surface-1 border border-border px-4 py-5 text-sm text-muted">
          <p className="text-foreground font-medium mb-1">Database table missing</p>
          <p>Run <code className="text-[#6366f1]">npx drizzle-kit push</code> locally to create the <code className="text-[#6366f1]">reading_items</code> table, then trigger a sync.</p>
        </div>
      )}

      {/* Empty — table exists but no readings yet */}
      {tableReady && items.length === 0 && (
        <div className="rounded-xl bg-surface-1 border border-border px-4 py-5 text-sm text-muted">
          <p className="text-foreground font-medium mb-1">No readings extracted yet</p>
          <p>Make sure <code className="text-[#6366f1]">GROQ_API_KEY</code> is set in Vercel env vars, then trigger a manual sync.</p>
          <p className="mt-2 text-[11px]">Readings are only extracted from Canvas pages whose title or content contains keywords like "syllabus", "reading list", "course manual", or "studiemateriaal".</p>
        </div>
      )}

      {/* Readings list */}
      {groups.map((course) => {
        const accent      = fallbackColor(course.courseName);
        const courseDone  = course.lectures.flatMap((l) => l.items).filter((i) => i.completedAt).length;
        const courseTotal = course.lectures.flatMap((l) => l.items).length;

        return (
          <section key={course.courseCanvasId} className="mb-7">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted flex-1 truncate">
                {course.courseName}
              </p>
              <span className="text-[11px] text-muted/70 shrink-0 tabular-nums">{courseDone}/{courseTotal}</span>
            </div>

            {course.lectures.map((lecture) => (
              <div key={lecture.label} className="mb-4">
                <p className="text-[11px] text-[#6366f1] font-medium uppercase tracking-widest mb-1.5 ml-1">
                  {lecture.label}
                </p>
                <ul className="space-y-1.5">
                  <AnimatePresence mode="popLayout">
                    {lecture.items.map((item) => (
                      <ReadingRow
                        key={item.id}
                        item={item}
                        onComplete={handleComplete}
                        onUncomplete={handleUncomplete}
                        onEdit={(it) => setSheet({ mode: "edit", reading: it })}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </div>
            ))}
          </section>
        );
      })}

      {/* Manual reading side-sheet (add + edit + delete). */}
      {sheet && (
        <ReadingSheet
          mode={sheet.mode}
          reading={sheet.reading}
          courses={courses}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
