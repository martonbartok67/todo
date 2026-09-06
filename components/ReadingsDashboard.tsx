"use client";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { completeReading, uncompleteReading } from "@/app/actions/readings";
import type { ReadingItem } from "@/drizzle/schema";

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
  items, tableReady,
}: {
  items: ReadingItem[];
  tableReady: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const groups    = groupReadings(items);
  const doneCount = items.filter((i) => i.completedAt).length;

  function handleComplete(id: number)   { startTransition(() => { completeReading(id); }); }
  function handleUncomplete(id: number) { startTransition(() => { uncompleteReading(id); }); }

  return (
    <>
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Readings</h1>
          <p className="text-xs text-[#6b7280] mt-0.5">
            {items.length > 0
              ? `${doneCount}/${items.length} complete · AI-extracted from course manuals`
              : "AI-extracted from course manuals"}
          </p>
        </div>
        <a href="/"
          className="text-[11px] text-[#6b7280] hover:text-white transition-colors border border-[#2a2a3a] rounded-lg px-2.5 py-1">
          ← Tasks
        </a>
      </header>

      {/* Table not ready */}
      {!tableReady && (
        <div className="rounded-xl bg-[#111118] border border-[#2a2a3a] px-4 py-5 text-sm text-[#6b7280]">
          <p className="text-white font-medium mb-1">Database table missing</p>
          <p>Run <code className="text-[#6366f1]">npx drizzle-kit push</code> locally to create the <code className="text-[#6366f1]">reading_items</code> table, then trigger a sync.</p>
        </div>
      )}

      {/* Empty — table exists but no readings yet */}
      {tableReady && items.length === 0 && (
        <div className="rounded-xl bg-[#111118] border border-[#2a2a3a] px-4 py-5 text-sm text-[#6b7280]">
          <p className="text-white font-medium mb-1">No readings extracted yet</p>
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
              <p className="text-[11px] font-medium uppercase tracking-widest text-[#6b7280] flex-1 truncate">
                {course.courseName}
              </p>
              <span className="text-[11px] text-[#374151] shrink-0">{courseDone}/{courseTotal}</span>
            </div>

            {course.lectures.map((lecture) => (
              <div key={lecture.label} className="mb-4">
                <p className="text-[11px] text-[#6366f1] font-medium uppercase tracking-widest mb-1.5 ml-1">
                  {lecture.label}
                </p>
                <ul className="space-y-1.5">
                  <AnimatePresence mode="popLayout">
                    {lecture.items.map((item) => {
                      const done = !!item.completedAt;
                      return (
                        <motion.li
                          key={item.id}
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -16 }}
                          transition={{ duration: 0.15 }}
                          className="flex items-start gap-3 rounded-xl bg-[#111118] border border-[#2a2a3a] px-3 py-2.5"
                        >
                          <button
                            disabled={isPending}
                            onClick={() => done ? handleUncomplete(item.id) : handleComplete(item.id)}
                            className={[
                              "mt-0.5 shrink-0 w-5 h-5 rounded-full border border-[#2a2a3a] transition-all flex items-center justify-center",
                              done ? "bg-[#6366f1] border-[#6366f1]" : "hover:border-[#6366f1]",
                              isPending ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                            ].join(" ")}
                            aria-label={done ? "Mark unread" : "Mark read"}
                          >
                            {done && <span className="text-[10px] text-white leading-none">✓</span>}
                          </button>

                          <div className="flex-1 min-w-0">
                            <p className={["text-sm leading-snug", done ? "line-through text-[#6b7280]" : "text-white"].join(" ")}>
                              {item.readingText}
                            </p>
                            {item.detail && (
                              <p className="text-[11px] text-[#6b7280] mt-0.5">{item.detail}</p>
                            )}
                          </div>

                          {item.sourcePageUrl && (
                            <a href={item.sourcePageUrl} target="_blank" rel="noopener noreferrer"
                              className="shrink-0 text-[#6b7280] hover:text-white transition-colors mt-0.5 text-xs">↗</a>
                          )}
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </>
  );
}
