"use client";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  attachTimetableDeadlines,
  saveIcalUrl,
  clearIcalUrl,
} from "@/app/actions/timetable";
import type { TimetableEvent } from "@/drizzle/schema";
import { formatDay, formatTime } from "@/lib/format";

function groupByDay(events: TimetableEvent[]): Map<string, TimetableEvent[]> {
  const out = new Map<string, TimetableEvent[]>();
  for (const e of events) {
    const key = e.startAt.slice(0, 10);
    if (!out.has(key)) out.set(key, []);
    out.get(key)!.push(e);
  }
  return out;
}

function dayLabel(iso: string): string {
  return formatDay(iso);
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

function durationLabel(startAt: string, endAt: string | null): string | null {
  if (!endAt) return null;
  const start = new Date(startAt);
  const end   = new Date(endAt);
  const mins  = Math.round((end.getTime() - start.getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
        setSaveResult(`Saved. Synced ${r.synced} events.`);
      }
    });
  }

  function handleClear() {
    if (!confirm("Remove the iCal feed and delete all iCal-sourced events?")) return;
    startClear(async () => {
      await clearIcalUrl();
      setSaveResult("Cleared.");
      setIcalInput("");
      setIcalLabel("");
    });
  }

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
        }}
      >
        <h1 style={{ fontSize: "24px", fontWeight: 800, lineHeight: 1.2, color: "var(--foreground)" }}>
          Schedule
        </h1>
        <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
          {events.length > 0
            ? `${events.length} upcoming events`
            : "No upcoming events synced yet"}
        </p>
      </header>

      <div style={{ padding: "18px 16px", paddingBottom: "88px" }} className="md:!p-0">
        {/* iCal feed configuration */}
        <section
          style={{
            borderRadius: "16px",
            background: "var(--surface-card)",
            padding: "16px",
            marginBottom: "22px",
          }}
        >
          <div className="flex items-baseline justify-between gap-2" style={{ marginBottom: "12px" }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>
              MyTimetable iCal feed
            </p>
            <p style={{ fontSize: "10px", color: "var(--muted)", fontWeight: 700 }}>Optional</p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <input
              type="url"
              value={icalInput}
              onChange={(e) => setIcalInput(e.target.value)}
              placeholder="https://timetables.eur.nl/..."
              style={{
                width: "100%",
                fontSize: "13px",
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "10px 12px",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
            <input
              type="text"
              value={icalLabelInput}
              onChange={(e) => setIcalLabel(e.target.value)}
              placeholder="Label (optional)"
              style={{
                width: "100%",
                fontSize: "13px",
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "10px 12px",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
            <div className="flex items-center gap-2">
              <button
                disabled={isSaving || !icalInput.trim()}
                onClick={handleSave}
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--accent-fg)",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "10px",
                  padding: "8px 16px",
                  cursor: isSaving || !icalInput.trim() ? "not-allowed" : "pointer",
                  opacity: isSaving || !icalInput.trim() ? 0.4 : 1,
                }}
              >
                {isSaving ? "Saving…" : "Save & sync"}
              </button>
              {icalUrl && (
                <button
                  disabled={isClearing}
                  onClick={handleClear}
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--urgency-critical)",
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "10px",
                    padding: "8px 16px",
                    cursor: "pointer",
                  }}
                >
                  {isClearing ? "Clearing…" : "Remove feed"}
                </button>
              )}
              {saveResult && (
                <p style={{ fontSize: "11px", color: "var(--accent)", flex: 1 }}>{saveResult}</p>
              )}
            </div>
          </div>

          <details style={{ marginTop: "12px" }} className="group">
            <summary style={{ fontSize: "11px", color: "var(--muted)", cursor: "pointer", listStyle: "none", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>▸</span> How do I get this URL?
            </summary>
            <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "8px", lineHeight: 1.6 }}>
              In MyTimetable, click your name → <em>Subscribe</em> → copy the calendar URL and paste it above.
            </p>
          </details>
        </section>

        {/* Attach deadlines */}
        {undatedTaskCount > 0 && events.length > 0 && (
          <div
            style={{
              borderRadius: "16px",
              background: "var(--surface-card)",
              padding: "16px",
              marginBottom: "22px",
            }}
          >
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)" }}>
              {undatedTaskCount} undated task{undatedTaskCount === 1 ? "" : "s"}
            </p>
            <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
              Assign each pending task a deadline from its next matching calendar event.
            </p>
            <div className="flex items-center gap-2" style={{ marginTop: "10px" }}>
              <button
                disabled={isAttaching}
                onClick={handleAttach}
                style={{
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--accent-fg)",
                  background: "var(--accent)",
                  border: "none",
                  borderRadius: "10px",
                  padding: "8px 16px",
                  cursor: isAttaching ? "not-allowed" : "pointer",
                  opacity: isAttaching ? 0.4 : 1,
                }}
              >
                {isAttaching ? "Working…" : "Attach timetable deadlines"}
              </button>
              {attachResult && (
                <p style={{ fontSize: "11px", color: "var(--accent)", flex: 1 }}>{attachResult}</p>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {events.length === 0 && !icalUrl && (
          <div style={{ borderRadius: "16px", background: "var(--surface-card)", padding: "20px" }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
              No calendar events found
            </p>
            <p style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.6 }}>
              Canvas returned an empty calendar and you haven't set up an iCal feed yet.
              Paste your MyTimetable iCal URL above to get started.
            </p>
          </div>
        )}

        {/* Day groups */}
        {Array.from(byDay.entries()).map(([day, dayEvents]) => (
          <section key={day} style={{ marginBottom: "22px" }}>
            <p
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "var(--muted)",
                marginBottom: "6px",
                marginLeft: "2px",
              }}
            >
              {dayLabel(day)}
            </p>
            {/* Panel */}
            <div style={{ background: "var(--surface-card)", borderRadius: "16px", overflow: "hidden" }}>
              <AnimatePresence>
                {dayEvents.map((e, idx) => {
                  const accent = e.courseName ? courseColor(e.courseName) : "var(--muted)";
                  const dur = durationLabel(e.startAt, (e as any).endAt ?? null);
                  return (
                    <motion.div
                      key={e.canvasId}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        display: "flex",
                        alignItems: "stretch",
                        borderBottom: idx < dayEvents.length - 1 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      {/* Left color rail */}
                      <div style={{ width: "4px", background: accent, flexShrink: 0 }} />

                      <div className="flex-1 min-w-0" style={{ padding: "12px 14px" }}>
                        {/* Time + title */}
                        <div className="flex items-start justify-between gap-2">
                          <div style={{ flexShrink: 0, minWidth: "52px" }}>
                            <p style={{ fontSize: "14px", fontWeight: 800, color: "var(--foreground)" }} className="tabular-nums">
                              {formatTime(e.startAt)}
                            </p>
                            {dur && (
                              <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted)" }}>
                                {dur}
                              </p>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)", lineHeight: 1.3 }}>
                              {e.title}
                              {e.source === "ical" && (
                                <span style={{ marginLeft: "6px", fontSize: "9px", color: "var(--accent)", fontWeight: 700 }}>
                                  iCal
                                </span>
                              )}
                            </p>
                            {/* Meta row */}
                            {(e.courseName || e.location) && (
                              <div className="flex items-center justify-between" style={{ marginTop: "4px" }}>
                                {e.courseName && (
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      style={{ width: "6px", height: "6px", borderRadius: "50%", background: accent, flexShrink: 0 }}
                                    />
                                    <span style={{ fontSize: "11px", color: "var(--muted)" }}>{e.courseName}</span>
                                  </div>
                                )}
                                {e.location && (
                                  <span style={{ fontSize: "11px", color: "var(--muted)" }}>{e.location}</span>
                                )}
                              </div>
                            )}
                          </div>
                          {e.sourceUrl && e.sourceUrl.startsWith("http") && (
                            <a
                              href={e.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ flexShrink: 0, color: "var(--muted)", fontSize: "14px" }}
                              className="hover:opacity-80 transition-opacity"
                            >↗</a>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
