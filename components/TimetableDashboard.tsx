"use client";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  attachTimetableDeadlines,
  saveIcalUrl,
  clearIcalUrl,
} from "@/app/actions/timetable";
import type { TimetableEvent } from "@/drizzle/schema";

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
  icalUrl,
  icalLabel,
}: {
  events: TimetableEvent[];
  undatedTaskCount: number;
  icalUrl: string | null;
  icalLabel: string | null;
}) {
  const [isAttaching, startAttach] = useTransition();
  const [attachResult, setAttachResult] = useState<string | null>(null);

  const [icalInput, setIcalInput]       = useState(icalUrl ?? "");
  const [icalLabelInput, setIcalLabel] = useState(icalLabel ?? "");
  const [isSaving, startSave]          = useTransition();
  const [isClearing, startClear]       = useTransition();
  const [saveResult, setSaveResult]     = useState<string | null>(null);

  const byDay = groupByDay(events);

  function handleAttach() {
    startAttach(async () => {
      const r = await attachTimetableDeadlines();
      setAttachResult(
        `Attached ${r.matched} of ${r.matched + r.noEvents} tasks. ` +
        `${r.noEvents} couldn't find a matching event.`
      );
    });
  }

  function handleSave() {
    startSave(async () => {
      const r = await saveIcalUrl(icalInput, icalLabelInput || null);
      if (r.status === "error") {
        setSaveResult(`Error: ${r.error}`);
      } else {
        setSaveResult(`Saved. Synced ${r.synced} events.${r.error ? " (sync error: " + r.error + ")" : ""}`);
      }
    });
  }

  function handleClear() {
    if (!confirm("Remove the iCal feed and delete all iCal-sourced events? Canvas events are unaffected.")) return;
    startClear(async () => {
      const r = await clearIcalUrl();
      setSaveResult(`Cleared. Removed ${r.removed} events.`);
      setIcalInput("");
      setIcalLabel("");
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

      {/* iCal feed configuration */}
      <section className="rounded-xl bg-[#111118] border border-[#2a2a3a] px-4 py-3 mb-5">
        <p className="text-sm text-white">MyTimetable iCal feed</p>
        <p className="text-[11px] text-[#6b7280] mt-0.5">
          In MyTimetable, click your name → <em>Subscribe</em> → copy the
          calendar URL (looks like <code className="text-[#6366f1]">https://timetables.eur.nl/...</code>)
          and paste it here. We pull it every hour and store the events
          alongside any Canvas-sourced ones.
        </p>
        <div className="mt-3 space-y-2">
          <input
            type="url"
            value={icalInput}
            onChange={(e) => setIcalInput(e.target.value)}
            placeholder="https://timetables.eur.nl/..."
            className="w-full text-[12px] bg-[#0a0a0f] border border-[#2a2a3a] rounded-lg px-3 py-2 text-white placeholder-[#4b5563] focus:outline-none focus:border-[#6366f1]"
          />
          <input
            type="text"
            value={icalLabelInput}
            onChange={(e) => setIcalLabel(e.target.value)}
            placeholder="Label (optional) e.g. 'My RSM schedule'"
            className="w-full text-[12px] bg-[#0a0a0f] border border-[#2a2a3a] rounded-lg px-3 py-2 text-white placeholder-[#4b5563] focus:outline-none focus:border-[#6366f1]"
          />
          <div className="flex items-center gap-2 pt-1">
            <button
              disabled={isSaving || !icalInput.trim()}
              onClick={handleSave}
              className="text-[11px] text-white bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-40 transition-colors rounded-lg px-3 py-1.5"
            >
              {isSaving ? "Saving…" : "Save & sync"}
            </button>
            {icalUrl && (
              <button
                disabled={isClearing}
                onClick={handleClear}
                className="text-[11px] text-[#ef4444] hover:text-white border border-[#2a2a3a] hover:border-[#ef4444] transition-colors rounded-lg px-3 py-1.5"
              >
                {isClearing ? "Clearing…" : "Remove feed"}
              </button>
            )}
            {saveResult && (
              <p className="text-[11px] text-[#10b981] flex-1">{saveResult}</p>
            )}
          </div>
        </div>
      </section>

      {/* Action: attach timetable deadlines to undated tasks */}
      {undatedTaskCount > 0 && events.length > 0 && (
        <div className="rounded-xl bg-[#111118] border border-[#2a2a3a] px-4 py-3 mb-5">
          <p className="text-sm text-white">
            {undatedTaskCount} undated task{undatedTaskCount === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-[#6b7280] mt-0.5">
            Assign each pending task a deadline from its next matching calendar event.
          </p>
          <div className="flex items-center gap-2 mt-2.5">
            <button
              disabled={isAttaching}
              onClick={handleAttach}
              className="text-[11px] text-white bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-40 transition-colors rounded-lg px-3 py-1.5"
            >
              {isAttaching ? "Working…" : "Attach timetable deadlines"}
            </button>
            {attachResult && (
              <p className="text-[11px] text-[#10b981] flex-1">{attachResult}</p>
            )}
          </div>
        </div>
      )}

      {/* Empty state — only show if no events and no iCal configured */}
      {events.length === 0 && !icalUrl && (
        <div className="rounded-xl bg-[#111118] border border-[#2a2a3a] px-4 py-5 text-sm text-[#6b7280]">
          <p className="text-white font-medium mb-1">No calendar events found</p>
          <p>
            Canvas returned an empty calendar and you haven't set up an iCal
            feed yet. The EUR usually populates Canvas once your courses are
            live; meanwhile, paste your MyTimetable iCal URL above to get
            started.
          </p>
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
                        <p className="text-sm text-white leading-snug">
                          {e.title}
                          {e.source === "ical" && (
                            <span className="ml-1.5 text-[9px] uppercase tracking-wider text-[#06b6d4]">iCal</span>
                          )}
                        </p>
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
                      {e.sourceUrl && e.sourceUrl.startsWith("http") && (
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
