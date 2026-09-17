"use client";
import { useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  attachTimetableDeadlines, saveIcalUrl, clearIcalUrl,
  type AttachResult,
} from "@/app/actions/timetable";
import type { TimetableEvent } from "@/drizzle/schema";
import { formatDay, formatTime } from "@/lib/format";
import { courseColor } from "@/lib/colors";
import { eventKind, campusDateKey, type EventKind } from "@/lib/schedule";

const KIND_LABEL: Record<EventKind, string | null> = {
  lecture:  "Lecture",
  workshop: "Workshop",
  exam:     "Exam",
  other:    null,
};

function groupByDay(events: TimetableEvent[]): [string, TimetableEvent[]][] {
  const out = new Map<string, TimetableEvent[]>();
  for (const e of events) {
    // campusDateKey, not `startAt.slice(0, 10)`: startAt is stored as a UTC
    // instant, and slicing it reads the UTC calendar date. A 00:30
    // Amsterdam lecture (22:30Z the day before) would then be filed under
    // yesterday's heading.
    const key = campusDateKey(new Date(e.startAt));
    const list = out.get(key);
    if (list) list.push(e);
    else out.set(key, [e]);
  }
  return Array.from(out.entries());
}

function durationLabel(startAt: string, endAt: string | null): string | null {
  if (!endAt) return null;
  const mins = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000);
  if (mins <= 0) return null;
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Human summary of an attach run — says what happened *and* what didn't. */
function summarise(r: AttachResult): { headline: string; tone: "ok" | "warn" | "none" } {
  if (r.matched === 0 && r.considered === 0) {
    return { headline: "Nothing to attach — every task already has a date.", tone: "none" };
  }
  if (r.matched === 0) {
    return { headline: `No deadlines could be derived from ${r.considered} undated tasks.`, tone: "warn" };
  }
  const bits = [`Dated ${r.matched} of ${r.considered} tasks`];
  if (r.corrected)      bits.push(`${r.corrected} corrected`);
  if (r.relinkedEvents) bits.push(`${r.relinkedEvents} calendar events linked to a subject`);
  if (r.readingsDated)  bits.push(`${r.readingsDated} readings dated`);
  return {
    headline: bits.join(" · ") + ".",
    tone: r.matched < r.considered ? "warn" : "ok",
  };
}

export default function TimetableDashboard({
  events, undatedTaskCount, icalUrl, icalLabel,
}: {
  events: TimetableEvent[];
  undatedTaskCount: number;
  icalUrl: string | null;
  icalLabel: string | null;
}) {
  const [isAttaching, startAttach] = useTransition();
  const [attach, setAttach]        = useState<AttachResult | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const [icalInput, setIcalInput]      = useState(icalUrl ?? "");
  const [icalLabelInput, setIcalLabel] = useState(icalLabel ?? "");
  const [isSaving, startSave]          = useTransition();
  const [isClearing, startClear]       = useTransition();
  const [saveResult, setSaveResult]    = useState<string | null>(null);
  const [showFeed, setShowFeed]        = useState(!icalUrl);

  const byDay   = useMemo(() => groupByDay(events), [events]);
  const todayKey = campusDateKey(new Date());

  function handleAttach() {
    startAttach(async () => {
      setAttach(await attachTimetableDeadlines());
      setShowDetail(false);
    });
  }

  function handleSave() {
    startSave(async () => {
      const r = await saveIcalUrl(icalInput, icalLabelInput || null);
      setSaveResult(r.status === "error" ? `Error: ${r.error}` : "Saved. Run a sync to pull the feed.");
    });
  }

  function handleClear() {
    if (!confirm("Remove the iCal feed? Events already synced stay until the next sync.")) return;
    startClear(async () => {
      await clearIcalUrl();
      setSaveResult("Feed removed.");
      setIcalInput("");
      setIcalLabel("");
    });
  }

  const summary = attach ? summarise(attach) : null;

  return (
    <>
      <header className="page-header md:!static md:!backdrop-blur-none md:mb-5">
        <h1 className="page-title">Schedule</h1>
        <p className="page-subtitle">
          {events.length > 0
            ? `${events.length} session${events.length === 1 ? "" : "s"} over the next 4 weeks`
            : "No upcoming sessions synced yet"}
        </p>
      </header>

      <div style={{ padding: "0 16px 88px" }} className="md:!p-0">

        {/* ── Attach deadlines ── */}
        {undatedTaskCount > 0 && (
          <section className="card card-raised" style={{ padding: "16px", marginBottom: "18px" }}>
            <div className="flex items-start gap-3">
              <div
                aria-hidden
                style={{
                  width: "34px", height: "34px", borderRadius: "var(--r-md)",
                  background: "var(--accent-soft)", color: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4.5" width="18" height="17" rx="3" />
                  <path d="M8 2.5v4M16 2.5v4M3 10h18M9 15l2 2 4-4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: "14.5px", fontWeight: 800, color: "var(--foreground)" }}>
                  {undatedTaskCount} task{undatedTaskCount === 1 ? "" : "s"} without a deadline
                </p>
                <p style={{ fontSize: "12px", color: "var(--muted)", marginTop: "3px", lineHeight: 1.55 }}>
                  Each task names a week or module number. That number is matched against this
                  subject&apos;s own teaching weeks, and the task is dated one hour before the
                  lecture — or the workshop, when the task belongs to one.
                </p>
              </div>
            </div>

            <button
              disabled={isAttaching || events.length === 0}
              onClick={handleAttach}
              className="btn btn-primary"
              style={{ marginTop: "13px", width: "100%" }}
            >
              {isAttaching ? "Matching against the calendar…" : "Attach timetable deadlines"}
            </button>

            {events.length === 0 && (
              <p style={{ fontSize: "11.5px", color: "var(--urgency-high)", marginTop: "8px" }}>
                No calendar events to match against — add your iCal feed below first.
              </p>
            )}

            {/* Result */}
            <AnimatePresence>
              {summary && attach && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    marginTop: "12px", padding: "11px 12px",
                    borderRadius: "var(--r-md)",
                    background: summary.tone === "warn"
                      ? "color-mix(in srgb, var(--urgency-high) 12%, transparent)"
                      : "var(--accent-soft)",
                  }}
                >
                  <p style={{
                    fontSize: "12.5px", fontWeight: 700, lineHeight: 1.5,
                    color: summary.tone === "warn" ? "var(--urgency-high)" : "var(--accent)",
                  }}>
                    {summary.headline}
                  </p>

                  {(attach.noWeekRef + attach.noCourseEvents + attach.noEventForWeek) > 0 && (
                    <>
                      <button
                        onClick={() => setShowDetail((v) => !v)}
                        style={{
                          marginTop: "7px", background: "none", border: "none", padding: 0,
                          fontSize: "11.5px", fontWeight: 700, cursor: "pointer",
                          color: "var(--muted)", textDecoration: "underline",
                        }}
                      >
                        {showDetail ? "Hide" : "Why were the rest skipped?"}
                      </button>

                      {showDetail && (
                        <div style={{ marginTop: "9px" }}>
                          <ul style={{ fontSize: "11.5px", color: "var(--muted)", lineHeight: 1.8 }}>
                            {attach.noWeekRef > 0 && (
                              <li>{attach.noWeekRef} · no week or module number in the title</li>
                            )}
                            {attach.noCourseEvents > 0 && (
                              <li>{attach.noCourseEvents} · that subject has no events on the calendar</li>
                            )}
                            {attach.noEventForWeek > 0 && (
                              <li>{attach.noEventForWeek} · the week named has no session scheduled</li>
                            )}
                          </ul>
                          {attach.failures.length > 0 && (
                            <div style={{
                              marginTop: "9px", paddingTop: "9px",
                              borderTop: "1px solid var(--border)",
                            }}>
                              {attach.failures.map((f, i) => (
                                <p key={i} style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.6 }}>
                                  <span style={{ fontWeight: 700, color: "var(--foreground-soft)" }}>
                                    {f.title}
                                  </span>
                                  {" — "}{f.reason}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {/* ── Agenda ── */}
        {byDay.map(([day, dayEvents]) => {
          const isToday = day === todayKey;
          return (
            <section key={day} style={{ marginBottom: "20px" }}>
              <div className="flex items-center gap-2" style={{ marginBottom: "7px", marginLeft: "2px" }}>
                <span className="section-label" style={isToday ? { color: "var(--accent)" } : undefined}>
                  {formatDay(day)}
                </span>
                {isToday && (
                  <span className="chip" style={{ color: "var(--accent)" }}>Today</span>
                )}
                <span className="section-label ml-auto">{dayEvents.length}</span>
              </div>

              <div className="card">
                {dayEvents.map((e) => {
                  const accent = e.courseName ? courseColor(e.courseName) : "var(--muted)";
                  const dur    = durationLabel(e.startAt, e.endAt);
                  const kind   = eventKind(e);
                  const kindLabel = KIND_LABEL[kind];
                  return (
                    <div key={e.canvasId} className="row flex items-stretch">
                      {/* Time rail */}
                      <div
                        style={{
                          flexShrink: 0, width: "62px",
                          padding: "13px 0 13px 14px",
                          borderRight: "1px solid var(--border)",
                        }}
                      >
                        <p className="tabular-nums" style={{
                          fontSize: "14px", fontWeight: 800, color: "var(--foreground)",
                          letterSpacing: "-0.02em",
                        }}>
                          {formatTime(e.startAt)}
                        </p>
                        {dur && (
                          <p className="tabular-nums" style={{
                            fontSize: "10.5px", fontWeight: 700, color: "var(--muted)", marginTop: "2px",
                          }}>
                            {dur}
                          </p>
                        )}
                      </div>

                      {/* Colour rail */}
                      <div aria-hidden style={{ width: "3px", background: accent, flexShrink: 0 }} />

                      <div className="flex-1 min-w-0" style={{ padding: "13px 14px" }}>
                        <div className="flex items-start gap-2">
                          <p className="flex-1 min-w-0" style={{
                            fontSize: "14px", fontWeight: 700, lineHeight: 1.35,
                            color: "var(--foreground)", letterSpacing: "-0.01em",
                          }}>
                            {e.title}
                          </p>
                          {e.sourceUrl?.startsWith("http") && (
                            <a
                              href={e.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="tap-target hover:opacity-70 transition-opacity"
                              style={{ flexShrink: 0, color: "var(--muted)", lineHeight: 0, padding: "2px" }}
                              aria-label="Open source"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 4h6v6M20 4l-8.5 8.5" />
                                <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
                              </svg>
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-x-2 gap-y-1 flex-wrap" style={{ marginTop: "6px" }}>
                          {kindLabel && (
                            <span className="chip" style={{
                              color: kind === "exam" ? "var(--urgency-critical)" : accent,
                            }}>
                              {kindLabel}
                            </span>
                          )}
                          {e.courseName && (
                            <span className="truncate" style={{
                              fontSize: "11.5px", fontWeight: 600, color: "var(--muted)", maxWidth: "170px",
                            }}>
                              {e.courseName}
                            </span>
                          )}
                          {e.location && (
                            <span className="ml-auto truncate" style={{
                              fontSize: "11.5px", color: "var(--muted)", maxWidth: "130px",
                            }}>
                              {e.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {events.length === 0 && (
          <div className="card" style={{ padding: "28px 20px", textAlign: "center", marginBottom: "18px" }}>
            <p style={{ fontSize: "15px", fontWeight: 800, color: "var(--foreground)" }}>
              No sessions on the calendar
            </p>
            <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "5px", lineHeight: 1.6 }}>
              Deadlines are derived from your lectures and workshops, so the calendar has to be
              populated first. Paste your MyTimetable iCal URL below.
            </p>
          </div>
        )}

        {/* ── iCal feed ── */}
        <section className="card" style={{ marginBottom: "18px" }}>
          <button
            onClick={() => setShowFeed((v) => !v)}
            className="flex items-center justify-between w-full"
            style={{ padding: "14px 16px", background: "none", border: "none", cursor: "pointer" }}
            aria-expanded={showFeed}
          >
            <span className="text-left">
              <span style={{ fontSize: "14px", fontWeight: 800, color: "var(--foreground)", display: "block" }}>
                MyTimetable feed
              </span>
              <span style={{ fontSize: "11.5px", color: "var(--muted)" }}>
                {icalUrl ? (icalLabel || "Connected") : "Not connected"}
              </span>
            </span>
            <span className="chip" style={{ color: icalUrl ? "var(--accent)" : "var(--muted)" }}>
              {icalUrl ? "Connected" : "Set up"}
            </span>
          </button>

          <AnimatePresence initial={false}>
            {showFeed && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                style={{ overflow: "hidden" }}
              >
                <div style={{ padding: "0 16px 16px", borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginTop: "14px" }}>
                    <input
                      type="url"
                      className="field"
                      value={icalInput}
                      onChange={(ev) => setIcalInput(ev.target.value)}
                      placeholder="https://timetables.eur.nl/..."
                    />
                    <input
                      type="text"
                      className="field"
                      value={icalLabelInput}
                      onChange={(ev) => setIcalLabel(ev.target.value)}
                      placeholder="Label (optional)"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        disabled={isSaving || !icalInput.trim()}
                        onClick={handleSave}
                        className="btn btn-primary"
                      >
                        {isSaving ? "Saving…" : "Save feed"}
                      </button>
                      {icalUrl && (
                        <button disabled={isClearing} onClick={handleClear} className="btn btn-danger">
                          {isClearing ? "Removing…" : "Remove"}
                        </button>
                      )}
                    </div>
                    {saveResult && (
                      <p style={{ fontSize: "11.5px", color: "var(--accent)" }}>{saveResult}</p>
                    )}
                    <p style={{ fontSize: "11.5px", color: "var(--muted)", lineHeight: 1.6 }}>
                      In MyTimetable: your name → <em>Subscribe</em> → copy the calendar URL.
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </>
  );
}
