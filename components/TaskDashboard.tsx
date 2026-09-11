"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { completeTask, uncompleteTask } from "@/app/actions/tasks";
import type { EnrichedTask, CourseGroup, UrgencyLevel } from "@/lib/tasks";
import type { SyncLog } from "@/drizzle/schema";
import { TaskCard } from "./TaskCard";
import { ClassifyCourseButton } from "./ClassifyCourseButton";
import { formatDateTime } from "@/lib/format";

type Props = {
  pending:   EnrichedTask[];
  byCourse:  CourseGroup[];
  completed: EnrichedTask[];
  lastSync:  SyncLog | null;
};

const URGENCY_SECTION: Record<UrgencyLevel, { label: string; color: string }> = {
  critical: { label: "Overdue / Due < 24h", color: "var(--urgency-critical)" },
  high:     { label: "Due within 48h",      color: "var(--urgency-high)" },
  medium:   { label: "This week",           color: "var(--urgency-medium)" },
  low:      { label: "Upcoming",            color: "var(--urgency-low)" },
  none:     { label: "No due date",         color: "var(--muted)" },
};

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

function fallbackColor(name: string): string {
  const colors = ["#2C6958","#7A4F83","#286982","#3D7C6F","#C9991A","#D4574D","#6B73AA","#557AA3"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[Math.abs(h)];
}

function courseColor(name: string, accentColor?: string | null): string {
  if (accentColor) return accentColor;
  for (const [key, val] of Object.entries(COURSE_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return val;
  }
  return fallbackColor(name);
}

type ViewMode = "urgency" | "course";

export default function TaskDashboard({ pending, byCourse, completed, lastSync }: Props) {
  const [isPending, startTransition] = useTransition();
  const [view, setView]              = useState<ViewMode>("urgency");
  const [showCompleted, setShowCompleted] = useState(false);

  function handleComplete(id: number)   { startTransition(() => { completeTask(id); }); }
  function handleUncomplete(id: number) { startTransition(() => { uncompleteTask(id); }); }

  const urgencyOrder: UrgencyLevel[] = ["critical","high","medium","low","none"];
  const urgencyGroups = urgencyOrder
    .map((u) => ({ urgency: u, tasks: pending.filter((t) => t.urgency === u) }))
    .filter((g) => g.tasks.length > 0);

  return (
    <>
      {/* Sticky header */}
      <header
        className="sticky top-0 z-30 md:relative md:mb-5"
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, lineHeight: 1.2, color: "var(--foreground)" }}>
              Tasks
            </h1>
            {lastSync && (
              <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }} className="tabular-nums">
                Synced {formatDateTime(lastSync.startedAt)} · {lastSync.tasksUpserted} items
              </p>
            )}
          </div>

          {/* Segmented control */}
          <div
            className="inline-flex"
            style={{
              background: "var(--surface-1)",
              borderRadius: "12px",
              padding: "3px",
            }}
          >
            {(["urgency","course"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: "5px 12px",
                  borderRadius: "9px",
                  fontSize: "12px",
                  fontWeight: 600,
                  transition: "all 0.15s",
                  background: view === v ? "var(--foreground)" : "transparent",
                  color: view === v ? "var(--background)" : "var(--muted)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {v === "urgency" ? "Priority" : "Subject"}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Scrollable content */}
      <div style={{ padding: "0 16px", paddingBottom: "88px" }} className="md:!p-0">
        {pending.length === 0 && (
          <div className="text-center py-16" style={{ color: "var(--muted)", fontSize: "14px" }}>
            No pending tasks.
          </div>
        )}

        {/* Priority view — panels per urgency group */}
        {view === "urgency" && (
          <AnimatePresence mode="popLayout">
            {urgencyGroups.map(({ urgency, tasks }) => {
              const uc = URGENCY_SECTION[urgency].color;
              return (
                <motion.section key={urgency} layout style={{ marginBottom: "22px" }}>
                  {/* Section label */}
                  <div className="flex items-center justify-between" style={{ marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>
                      {URGENCY_SECTION[urgency].label}
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>
                      {tasks.length}
                    </span>
                  </div>

                  {/* Panel */}
                  <div style={{ background: "var(--surface-card)", borderRadius: "16px", overflow: "hidden" }}>
                    {/* Panel header row */}
                    <div
                      className="flex items-center justify-between"
                      style={{
                        background: `color-mix(in srgb, ${uc} 14%, transparent)`,
                        padding: "10px 14px",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          style={{
                            width: "7px", height: "7px", borderRadius: "50%",
                            background: uc, flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: "12px", fontWeight: 700, color: uc }}>
                          {URGENCY_SECTION[urgency].label}
                        </span>
                      </div>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: uc }}>{tasks.length}</span>
                    </div>

                    <ul>
                      <AnimatePresence mode="popLayout">
                        {tasks.map((t) => (
                          <TaskCard key={t.id} task={t} onComplete={handleComplete} disabled={isPending} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </div>
                </motion.section>
              );
            })}
          </AnimatePresence>
        )}

        {/* Subject view */}
        {view === "course" && (
          <AnimatePresence mode="popLayout">
            {byCourse.map((group) => {
              const accent = courseColor(group.courseName, group.accentColor);
              return (
                <motion.section key={group.courseCanvasId} layout style={{ marginBottom: "22px" }}>
                  {/* Floating label */}
                  <div className="flex items-center gap-2" style={{ marginBottom: "6px" }}>
                    <span
                      style={{ width: "8px", height: "8px", borderRadius: "50%", background: accent, flexShrink: 0 }}
                    />
                    <Link
                      href={`/subjects/${group.courseCanvasId}`}
                      style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", flex: 1, minWidth: 0 }}
                      className="truncate hover:opacity-80 transition-opacity"
                    >
                      {group.courseName}
                    </Link>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }}>
                      {group.tasks.length}
                    </span>
                    <ClassifyCourseButton
                      courseId={group.courseCanvasId}
                      courseName={group.courseName}
                      variant="inline"
                    />
                  </div>

                  {/* Panel */}
                  <div style={{ background: "var(--surface-card)", borderRadius: "16px", overflow: "hidden" }}>
                    <ul>
                      <AnimatePresence mode="popLayout">
                        {group.tasks.map((t) => (
                          <TaskCard key={t.id} task={t} onComplete={handleComplete} disabled={isPending} />
                        ))}
                      </AnimatePresence>
                    </ul>
                  </div>
                </motion.section>
              );
            })}
          </AnimatePresence>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <section style={{ marginTop: "24px" }}>
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="flex items-center gap-2 w-full"
              style={{
                fontSize: "12px", fontWeight: 700, color: "var(--muted)",
                marginBottom: "6px", background: "none", border: "none", cursor: "pointer",
                padding: 0,
              }}
            >
              <span style={{ transition: "transform 0.15s", display: "inline-block", transform: showCompleted ? "rotate(90deg)" : "none" }}>
                ▸
              </span>
              Completed ({completed.length})
            </button>
            <AnimatePresence>
              {showCompleted && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ overflow: "hidden" }}
                >
                  <div style={{ background: "var(--surface-card)", borderRadius: "16px", overflow: "hidden", opacity: 0.55 }}>
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
