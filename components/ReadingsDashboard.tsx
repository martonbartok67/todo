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
import { courseColor } from "@/lib/colors";

type CourseGroup = {
  courseName:     string;
  courseCanvasId: string;
  lectures:       { label: string; items: ReadingItem[] }[];
};

/**
 * The AI extractor is supposed to emit one `lectureLabel` per module (see
 * lib/canvas/extract.ts's prompt: "Module 4: Cultural and institutional
 * frameworks"). For some pages it instead appends the numbered subsection
 * it's currently describing onto the module name — "Module 6: Organization
 * and structure - 6.1 Why do we have firms?", "...- 6.2 Why is there not
 * one large organization?", and so on — which gives every subsection its
 * own distinct label. Grouping strictly by that label then turns one
 * module into a dozen single-item groups instead of one group holding a
 * dozen readings, which is what actually happened in production.
 *
 * This doesn't touch the stored data — readingText/detail on each row
 * still carry the specific subsection topic (ReadingRow renders those).
 * It only widens the grouping *key* used for display: strip a trailing
 * " - <number>[.<number>] ..." suffix, so every subsection of the same
 * module collapses back under one header. A label with no such
 * numbered-subsection suffix — "Week 1", "Module 3 (wk38)", a genuine
 * "Module 3 - Introduction" with no digit after the dash — passes through
 * unchanged, so courses whose extraction already grouped correctly are
 * unaffected.
 */
function groupKeyFor(lectureLabel: string): string {
  const m = lectureLabel.match(/^(.*?)\s+-\s+\d+(?:\.\d+)?\b.*$/);
  return m ? m[1].trim() : lectureLabel;
}

function groupReadings(items: ReadingItem[]): CourseGroup[] {
  const courseMap = new Map<string, CourseGroup>();
  for (const item of items) {
    if (!courseMap.has(item.courseCanvasId)) {
      courseMap.set(item.courseCanvasId, {
        courseName: item.courseName, courseCanvasId: item.courseCanvasId, lectures: [],
      });
    }
    const course = courseMap.get(item.courseCanvasId)!;
    const key    = groupKeyFor(item.lectureLabel);
    let lecture  = course.lectures.find((l) => l.label === key);
    if (!lecture) { lecture = { label: key, items: [] }; course.lectures.push(lecture); }
    lecture.items.push(item);
  }
  // Readings within a merged module group should read in subsection
  // order, not insertion order — sort by the numeric part of the label
  // that was stripped to form the group key (falling back to id).
  for (const course of courseMap.values()) {
    for (const lecture of course.lectures) {
      lecture.items.sort((a, b) => {
        const na = parseFloat(a.lectureLabel.match(/-\s+(\d+(?:\.\d+)?)/)?.[1] ?? "");
        const nb = parseFloat(b.lectureLabel.match(/-\s+(\d+(?:\.\d+)?)/)?.[1] ?? "");
        if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
        return a.id - b.id;
      });
    }
  }
  return Array.from(courseMap.values());
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

  const [sheet, setSheet] = useState<{
    mode: "add" | "edit";
    reading: SheetReading | null;
  } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function handleComplete(id: number)   { startTransition(() => { completeReading(id); }); }
  function handleUncomplete(id: number) { startTransition(() => { uncompleteReading(id); }); }

  return (
    <>
      {/* Sticky header */}
      <header className="page-header md:!static md:!backdrop-blur-none md:mb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="page-title">
              Readings
            </h1>
            <p className="page-subtitle tabular-nums">
              {items.length > 0
                ? `${doneCount}/${items.length} complete`
                : "AI-extracted from course manuals"}
            </p>
          </div>
          <button
            onClick={() => setSheet({ mode: "add", reading: null })}
            style={{
              flexShrink: 0,
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 600,
              borderRadius: "9px",
              border: "1px solid var(--border)",
              background: "var(--surface-1)",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
          >
            + Add
          </button>
        </div>
      </header>

      <div style={{ padding: "18px 16px", paddingBottom: "88px" }} className="md:!p-0">
        {/* Table not ready */}
        {!tableReady && (
          <div
            className="card"
            style={{
              padding: "20px",
              fontSize: "14px",
              color: "var(--muted)",
              marginBottom: "22px",
            }}
          >
            <p style={{ color: "var(--foreground)", fontWeight: 600, marginBottom: "4px" }}>
              Database table missing
            </p>
            <p>Run <code style={{ color: "var(--accent)" }}>npx drizzle-kit push</code> locally.</p>
          </div>
        )}

        {tableReady && items.length === 0 && (
          <div
            className="card"
            style={{
              padding: "20px",
              fontSize: "14px",
              color: "var(--muted)",
              marginBottom: "22px",
            }}
          >
            <p style={{ color: "var(--foreground)", fontWeight: 600, marginBottom: "4px" }}>
              No readings extracted yet
            </p>
            <p>Make sure <code style={{ color: "var(--accent)" }}>GROQ_API_KEY</code> is set, then trigger a sync.</p>
          </div>
        )}

        {/* Readings list */}
        {groups.map((course) => {
          const accent      = courseColor(course.courseName);
          const courseDone  = course.lectures.flatMap((l) => l.items).filter((i) => i.completedAt).length;
          const courseTotal = course.lectures.flatMap((l) => l.items).length;

          return (
            <section key={course.courseCanvasId} style={{ marginBottom: "22px" }}>
              {/* Course header — click to collapse whole course */}
              <button
                onClick={() => toggleGroup(`c:${course.courseCanvasId}`)}
                className="flex items-center gap-2 w-full"
                style={{ marginBottom: "8px", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <span
                  style={{
                    transition: "transform 0.15s",
                    display: "inline-block",
                    transform: collapsed.has(`c:${course.courseCanvasId}`) ? "rotate(-90deg)" : "none",
                    fontSize: "10px", color: "var(--muted)",
                  }}
                >▾</span>
                <span
                  style={{ width: "8px", height: "8px", borderRadius: "50%", background: accent, flexShrink: 0 }}
                />
                <p
                  style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", flex: 1, minWidth: 0 }}
                  className="truncate"
                >
                  {course.courseName}
                </p>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }} className="tabular-nums">
                  {courseDone}/{courseTotal}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {!collapsed.has(`c:${course.courseCanvasId}`) && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    transition={{ duration: 0.18 }}
                    style={{ overflow: "hidden" }}
                  >
                    {course.lectures.map((lecture) => {
                      const lectureKey = `l:${course.courseCanvasId}:${lecture.label}`;
                      return (
                        <div key={lecture.label} style={{ marginBottom: "14px" }}>
                          {/* Lecture sublabel — click to collapse just this lecture */}
                          <button
                            onClick={() => toggleGroup(lectureKey)}
                            className="flex items-center gap-1.5 w-full"
                            style={{
                              background: "none", border: "none", cursor: "pointer", padding: 0,
                              marginBottom: "6px", marginLeft: "2px",
                            }}
                          >
                            <span
                              style={{
                                transition: "transform 0.15s",
                                display: "inline-block",
                                transform: collapsed.has(lectureKey) ? "rotate(-90deg)" : "none",
                                fontSize: "9px", color: "var(--accent)",
                              }}
                            >▾</span>
                            <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)" }}>
                              {lecture.label}
                            </p>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", marginLeft: "auto" }}>
                              {lecture.items.length}
                            </span>
                          </button>

                          <AnimatePresence initial={false}>
                            {!collapsed.has(lectureKey) && (
                              <motion.div
                                initial={{ height: 0 }}
                                animate={{ height: "auto" }}
                                exit={{ height: 0 }}
                                transition={{ duration: 0.16 }}
                                style={{ overflow: "hidden" }}
                              >
                                <div className="card">
                                  <ul>
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
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
      </div>

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
