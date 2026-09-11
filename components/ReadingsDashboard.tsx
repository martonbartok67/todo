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

const COURSE_COLORS: Record<string, string> = {
  Economics:     "#2C6958",
  Mathematics:   "#7A4F83",
  Statistics:    "#286982",
  Marketing:     "#3D7C6F",
  Psychology:    "#C9991A",
  Strategy:      "#D4574D",
  Biology:       "#6B73AA",
  Communication: "#557AA3",
};

function courseColor(name: string): string {
  for (const [key, val] of Object.entries(COURSE_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return val;
  }
  const colors = ["#2C6958","#7A4F83","#286982","#3D7C6F","#C9991A","#D4574D","#6B73AA","#557AA3"];
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

  const [sheet, setSheet] = useState<{
    mode: "add" | "edit";
    reading: SheetReading | null;
  } | null>(null);

  function handleComplete(id: number)   { startTransition(() => { completeReading(id); }); }
  function handleUncomplete(id: number) { startTransition(() => { uncompleteReading(id); }); }

  return (
    <>
      {/* Sticky header */}
      <header
        className="sticky top-0 z-30 md:relative"
        style={{
          paddingTop: "54px",
          paddingLeft: "18px",
          paddingRight: "18px",
          paddingBottom: "12px",
          background: "color-mix(in srgb, var(--background) 95%, transparent)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          marginBottom: "0",
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 style={{ fontSize: "24px", fontWeight: 800, lineHeight: 1.2, color: "var(--foreground)" }}>
              Readings
            </h1>
            <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }} className="tabular-nums">
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
            style={{
              borderRadius: "16px",
              background: "var(--surface-card)",
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
            style={{
              borderRadius: "16px",
              background: "var(--surface-card)",
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
              {/* Course header */}
              <div className="flex items-center gap-2" style={{ marginBottom: "8px" }}>
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
              </div>

              {course.lectures.map((lecture) => (
                <div key={lecture.label} style={{ marginBottom: "14px" }}>
                  {/* Lecture sublabel in accent color */}
                  <p
                    style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "var(--accent)",
                      marginBottom: "6px",
                      marginLeft: "2px",
                    }}
                  >
                    {lecture.label}
                  </p>

                  {/* Panel */}
                  <div style={{ background: "var(--surface-card)", borderRadius: "16px", overflow: "hidden" }}>
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
                </div>
              ))}
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
