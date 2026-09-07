"use client";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { attachTimetableDeadlines } from "@/app/actions/timetable";
import type { TimetableEvent } from "@/drizzle/schema";

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function groupByDay(events: TimetableEvent[]): Map<string, TimetableEvent[]> {
  const out = new Map<string, TimetableEvent[]>();
  for (const e of events) {
    const key = e.startAt.slice(0, 10); // YYYY-MM-DD
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(e);
  }
  return out;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function fallbackColor(name: string): string {
  const colors = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[Math.abs(h)];
}

export default function TimetableDashboard({
  events,
  undatedTaskCount,
}: {
  events: TimetableEvent[];
  undatedTaskCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const byDay = groupByDay(events);

  function handleAttach() {
    startTransition(async () => {
      const r = await attachTimetableDeadlines();
      setResult(
        `Attached ${r.matched} of ${r.matched + r.noEvents} tasks. ` +
        `${r.noEvents} couldn't find a matching event.`
      );
    });
  }

  return (
    <>
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Timetable</h1>
          <p className="text-xs text-[#6b7280] mt-0.5">
            {events.length > 0
              ? `${events.length} upcoming events (next 4 weeks)`
              : "No upcoming events synced yet"}
          </p>
        </div>
      </header>

      {/* Action: attach timetable deadlines to undated tasks */}
      {undatedTaskCount > 0 && (
        <div className="rounded-xl bg-[#111118] border border-[#2a2a3a] px-4 py-3 mb-5">
          <p className="text-sm text-white">
            {undatedTaskCount} undated task{undatedTaskCount === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-[#6b7280] mt-0.5">
            Assign each pending task a deadline from its next matching calendar event.
          </p>
          <div className="flex items-center gap-2 mt-2.5">
            <button
              disabled={isPending}
              onClick={handleAttach}
              className="text-[11px] text-white bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-40 transition-colors rounded-lg px-3 py-1.5"
            >
              {isPending ? "Working…" : "Attach timetable deadlines"}
            </button>
            {result && (
              <p className="text-[11px] text-[#10b981] flex-1">{result}</p>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {events.length === 0 && (
        <div className="rounded-xl bg-[#111118] border border-[#2a2a3a] px-4 py-5 text-sm text-[#6b7280]">
          <p className="text-white font-medium mb-1">No calendar events found</p>
          <p>
            Canvas returned an empty calendar. The EUR usually populates this
            feed from MyTimetables once your courses are live — try again
            after the term starts.
          </p>
          <p className="mt-2 text-[11px]">Trigger a sync with <code className="text-[#6366f1]">?phase=timetable</code> to refresh.</p>
        </div>
      )}

      {/* Day groups */}
      {Array.from(byDay.entries()).map(([day, dayEvents]) => (
        <section key={day} className="mb-5">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[#6b7280] mb-2 ml-1">
            {dayLabel(day)}
          </p>
          <ul className="space-y-1.5">
            <AnimatePresence>
              {dayEvents.map((e) => {
                const accent = e.courseName ? fallbackColor(e.courseName) : "#374151";
                return (
                  <motion.li
                    key={e.canvasId}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                    className="rounded-xl bg-[#111118] border border-[#2a2a3a] px-3 py-2.5"
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 text-center w-12">
                        <p className="text-[11px] text-[#6b7280]">
                          {new Date(e.startAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white leading-snug">{e.title}</p>
                        {e.courseName && (
                          <p className="text-[11px] mt-0.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: accent }} />
                            <span className="text-[#6b7280]">{e.courseName}</span>
                          </p>
                        )}
                        {e.location && (
                          <p className="text-[11px] text-[#6b7280] mt-0.5">📍 {e.location}</p>
                        )}
                      </div>
                      {e.sourceUrl && (
                        <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 text-[#6b7280] hover:text-white transition-colors mt-0.5 text-xs">↗</a>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </>
  );
}
