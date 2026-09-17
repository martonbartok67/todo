"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { completeTask, uncompleteTask } from "@/app/actions/tasks";
import type { EnrichedTask, CourseGroup, UrgencyLevel } from "@/lib/tasks";
import type { SyncLog } from "@/drizzle/schema";
import { TaskCard } from "./TaskCard";
import { ClassifyCourseButton } from "./ClassifyCourseButton";
import { formatDateTime } from "@/lib/format";
import { courseColor } from "@/lib/colors";

type Props = {
  pending:   EnrichedTask[];
  byCourse:  CourseGroup[];
  completed: EnrichedTask[];
  lastSync:  SyncLog | null;
};

const URGENCY_SECTION: Record<UrgencyLevel, { label: string; short: string; color: string }> = {
  critical: { label: "Overdue / due in under 24h", short: "Now",       color: "var(--urgency-critical)" },
  high:     { label: "Due within 48 hours",        short: "Soon",      color: "var(--urgency-high)" },
  medium:   { label: "Later this week",            short: "This week", color: "var(--urgency-medium)" },
  low:      { label: "Upcoming",                   short: "Upcoming",  color: "var(--urgency-low)" },
  none:     { label: "No due date yet",            short: "Undated",   color: "var(--muted)" },
};

const URGENCY_ORDER: UrgencyLevel[] = ["critical", "high", "medium", "low", "none"];

type ViewMode = "urgency" | "course";

/** Chevron that rotates to point down when its section is open. */
function Caret({ open, color }: { open: boolean; color: string }) {
  return (
    <svg
      width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      style={{
        transform: open ? "rotate(0deg)" : "rotate(-90deg)",
        transition: "transform var(--dur) var(--ease)",
        flexShrink: 0,
      }}
    >
      <path d="M5 9l7 7 7-7" />
    </svg>
  );
}

export default function TaskDashboard({ pending, byCourse, completed, lastSync }: Props) {
  const [isPending, startTransition]      = useTransition();
  const [view, setView]                   = useState<ViewMode>("urgency");
  const [showCompleted, setShowCompleted] = useState(false);
  const [collapsed, setCollapsed]         = useState<Set<string>>(new Set());

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const handleComplete   = (id: number) => startTransition(() => { completeTask(id); });
  const handleUncomplete = (id: number) => startTransition(() => { uncompleteTask(id); });

  const urgencyGroups = useMemo(
    () => URGENCY_ORDER
      .map((u) => ({ urgency: u, tasks: pending.filter((t) => t.urgency === u) }))
      .filter((g) => g.tasks.length > 0),
    [pending],
  );

  // Headline numbers. "Undated" is the one the timetable pipeline is meant
  // to shrink, so it earns a slot next to the urgent count.
  const dueSoon = useMemo(
    () => pending.filter((t) => t.urgency === "critical" || t.urgency === "high").length,
    [pending],
  );
  const undated = useMemo(() => pending.filter((t) => !t.dueAt).length, [pending]);

  return (
    <>
      <header className="page-header md:!static md:!backdrop-blur-none md:mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="page-title">Tasks</h1>
            {lastSync && (
              <p className="page-subtitle tabular-nums">
                Synced {formatDateTime(lastSync.startedAt)} · {lastSync.tasksUpserted} items
              </p>
            )}
          </div>

          <div className="segmented shrink-0">
            {(["urgency", "course"] as ViewMode[]).map((v) => (
              <button key={v} data-active={view === v} onClick={() => setView(v)}>
                {v === "urgency" ? "Priority" : "Subject"}
              </button>
            ))}
          </div>
        </div>

        {/* Stat strip */}
        {pending.length > 0 && (
          <div className="flex items-center gap-2" style={{ marginTop: "12px" }}>
            <Stat value={pending.length} label="open" color="var(--foreground)" />
            {dueSoon > 0 && (
              <Stat value={dueSoon} label="due soon" color="var(--urgency-critical)" />
            )}
            {undated > 0 && (
              <Link href="/timetable" className="contents">
                <Stat value={undated} label="undated" color="var(--muted)" hint="Attach deadlines →" />
              </Link>
            )}
          </div>
        )}
      </header>

      <div style={{ padding: "0 16px 88px" }} className="md:!p-0">
        {pending.length === 0 && (
          <div className="card" style={{ padding: "40px 20px", textAlign: "center" }}>
            <p style={{ fontSize: "15px", fontWeight: 800, color: "var(--foreground)" }}>
              Nothing pending
            </p>
            <p style={{ fontSize: "13px", color: "var(--muted)", marginTop: "4px" }}>
              Everything on your list is done or scheduled.
            </p>
          </div>
        )}

        {/* ── Priority view ── */}
        {view === "urgency" && (
          <AnimatePresence mode="popLayout">
            {urgencyGroups.map(({ urgency, tasks }) => {
              const uc   = URGENCY_SECTION[urgency].color;
              const key  = `u:${urgency}`;
              const open = !collapsed.has(key);
              return (
                <motion.section key={urgency} layout style={{ marginBottom: "18px" }}>
                  <div className="card">
                    <button
                      onClick={() => toggleGroup(key)}
                      className="flex items-center justify-between w-full"
                      style={{
                        background: `color-mix(in srgb, ${uc} 10%, var(--surface-card))`,
                        borderBottom: open ? `1px solid color-mix(in srgb, ${uc} 22%, transparent)` : "none",
                        padding: "11px 14px",
                        border: "none",
                        cursor: "pointer",
                      }}
                      aria-expanded={open}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Caret open={open} color={uc} />
                        <span aria-hidden style={{
                          width: "8px", height: "8px", borderRadius: "50%",
                          background: uc, flexShrink: 0,
                          boxShadow: `0 0 0 3px color-mix(in srgb, ${uc} 20%, transparent)`,
                        }} />
                        <span className="truncate" style={{
                          fontSize: "12.5px", fontWeight: 800, color: uc, letterSpacing: "-0.01em",
                        }}>
                          {URGENCY_SECTION[urgency].label}
                        </span>
                      </span>
                      <span className="chip tabular-nums" style={{ color: uc }}>{tasks.length}</span>
                    </button>

                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          style={{ overflow: "hidden" }}
                        >
                          <ul>
                            <AnimatePresence mode="popLayout">
                              {tasks.map((t) => (
                                <TaskCard key={t.id} task={t} onComplete={handleComplete} disabled={isPending} />
                              ))}
                            </AnimatePresence>
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.section>
              );
            })}
          </AnimatePresence>
        )}

        {/* ── Subject view ── */}
        {view === "course" && (
          <AnimatePresence mode="popLayout">
            {byCourse.map((group) => {
              const accent = courseColor(group.courseName, group.accentColor);
              const key    = `c:${group.courseCanvasId}`;
              const open   = !collapsed.has(key);
              return (
                <motion.section key={group.courseCanvasId} layout style={{ marginBottom: "18px" }}>
                  <div className="card">
                    <div
                      className="flex items-center gap-2.5"
                      style={{
                        background: `color-mix(in srgb, ${accent} 9%, var(--surface-card))`,
                        borderBottom: open ? `1px solid color-mix(in srgb, ${accent} 20%, transparent)` : "none",
                        padding: "10px 14px",
                      }}
                    >
                      <button
                        onClick={() => toggleGroup(key)}
                        aria-expanded={open}
                        aria-label={open ? "Collapse subject" : "Expand subject"}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
                      >
                        <Caret open={open} color={accent} />
                      </button>
                      <span aria-hidden style={{
                        width: "8px", height: "8px", borderRadius: "50%",
                        background: accent, flexShrink: 0,
                        boxShadow: `0 0 0 3px color-mix(in srgb, ${accent} 20%, transparent)`,
                      }} />
                      <Link
                        href={`/subjects/${group.courseCanvasId}`}
                        className="truncate hover:opacity-75 transition-opacity"
                        style={{ fontSize: "12.5px", fontWeight: 800, color: accent, flex: 1, minWidth: 0 }}
                      >
                        {group.courseName}
                      </Link>
                      <span className="chip tabular-nums" style={{ color: accent }}>{group.tasks.length}</span>
                      <ClassifyCourseButton
                        courseId={group.courseCanvasId}
                        courseName={group.courseName}
                        variant="inline"
                      />
                    </div>

                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          style={{ overflow: "hidden" }}
                        >
                          <ul>
                            <AnimatePresence mode="popLayout">
                              {group.tasks.map((t) => (
                                <TaskCard
                                  key={t.id}
                                  task={t}
                                  onComplete={handleComplete}
                                  disabled={isPending}
                                  hideCourse
                                />
                              ))}
                            </AnimatePresence>
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.section>
              );
            })}
          </AnimatePresence>
        )}

        {/* ── Completed ── */}
        {completed.length > 0 && (
          <section style={{ marginTop: "26px" }}>
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="flex items-center gap-2 w-full section-label"
              style={{
                marginBottom: "8px", background: "none", border: "none",
                cursor: "pointer", padding: 0,
              }}
              aria-expanded={showCompleted}
            >
              <Caret open={showCompleted} color="var(--muted)" />
              Completed · {completed.length}
            </button>
            <AnimatePresence initial={false}>
              {showCompleted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  style={{ overflow: "hidden" }}
                >
                  <div className="card" style={{ opacity: 0.68 }}>
                    <ul>
                      {completed.map((t) => (
                        <TaskCard key={t.id} task={t} onUncomplete={handleUncomplete} disabled={isPending} />
                      ))}
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}
      </div>
    </>
  );
}

/** One number + caption in the header strip. */
function Stat({
  value, label, color, hint,
}: {
  value: number; label: string; color: string; hint?: string;
}) {
  return (
    <div
      title={hint}
      style={{
        display: "flex", alignItems: "baseline", gap: "5px",
        padding: "5px 11px",
        borderRadius: "999px",
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
      }}
    >
      <span className="tabular-nums" style={{ fontSize: "14px", fontWeight: 900, color, lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--muted)", lineHeight: 1 }}>
        {label}
      </span>
    </div>
  );
}
