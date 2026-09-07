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

// Section labels + colors used by the urgency view. The dot/ring tokens
// live inside `TaskCard` itself.
const URGENCY_SECTION: Record<UrgencyLevel, { label: string; color: string }> = {
  critical: { label: "Overdue / Due < 24h", color: "text-[#ef4444]" },
  high:     { label: "Due within 48h",      color: "text-[#f97316]" },
  medium:   { label: "This week",           color: "text-[#eab308]" },
  low:      { label: "Upcoming",            color: "text-[#6366f1]" },
  none:     { label: "No due date",         color: "text-muted" },
};

function fallbackColor(name: string): string {
  const colors = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[Math.abs(h)];
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
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg md:text-base font-semibold tracking-tight">Tasks</h1>
          {lastSync && (
            <p className="text-xs text-muted mt-0.5 tabular-nums">
              Synced {formatDateTime(lastSync.startedAt)} · {lastSync.tasksUpserted} items
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted mr-2 tabular-nums">{pending.length} pending</span>
          {(["urgency","course"] as ViewMode[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={[
                "px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors",
                view === v
                  ? "bg-foreground border-foreground text-background"
                  : "bg-surface-1 border-border text-muted hover:text-foreground",
              ].join(" ")}
            >
              {v === "urgency" ? "Priority" : "Subject"}
            </button>
          ))}
        </div>
      </header>

      {pending.length === 0 && (
        <div className="text-center py-16 text-muted text-sm">No pending tasks.</div>
      )}

      {/* Priority view */}
      {view === "urgency" && (
        <AnimatePresence mode="popLayout">
          {urgencyGroups.map(({ urgency, tasks }) => (
            <motion.section key={urgency} layout className="mb-5">
              <p className={`text-[11px] font-medium uppercase tracking-widest mb-2 ${URGENCY_SECTION[urgency].color}`}>
                {URGENCY_SECTION[urgency].label}
              </p>
              <ul className="space-y-1.5">
                <AnimatePresence mode="popLayout">
                  {tasks.map((t) => (
                    <TaskCard key={t.id} task={t} onComplete={handleComplete} disabled={isPending} />
                  ))}
                </AnimatePresence>
              </ul>
            </motion.section>
          ))}
        </AnimatePresence>
      )}

      {/* Subject view */}
      {view === "course" && (
        <AnimatePresence mode="popLayout">
          {byCourse.map((group) => {
            const accent = group.accentColor ?? fallbackColor(group.courseName);
            return (
              <motion.section key={group.courseCanvasId} layout className="mb-5">
                <div className="flex items-center gap-1 mb-2">
                  <Link
                    href={`/subjects/${group.courseCanvasId}`}
                    className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 -mx-2 rounded-lg hover:bg-surface-1 transition-colors group"
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
                    <p className="text-[11px] font-medium uppercase tracking-widest text-muted group-hover:text-foreground transition-colors truncate">
                      {group.courseName}
                    </p>
                    <span className="text-[11px] text-muted/70 ml-auto tabular-nums shrink-0">{group.tasks.length}</span>
                    <span className="text-[10px] text-muted/70 group-hover:text-foreground transition-colors px-1.5 py-0.5 rounded border border-border group-hover:border-foreground/30 shrink-0">
                      View
                    </span>
                  </Link>
                  {/* Step 2: trigger AI classification for this course */}
                  <ClassifyCourseButton
                    courseId={group.courseCanvasId}
                    courseName={group.courseName}
                    variant="inline"
                  />
                </div>
                <ul className="space-y-1.5">
                  <AnimatePresence mode="popLayout">
                    {group.tasks.map((t) => (
                      <TaskCard key={t.id} task={t} onComplete={handleComplete} disabled={isPending} />
                    ))}
                  </AnimatePresence>
                </ul>
              </motion.section>
            );
          })}
        </AnimatePresence>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <section className="mt-6 border-t border-border pt-4">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 text-[11px] font-medium text-muted uppercase tracking-widest w-full mb-2 hover:text-foreground transition-colors"
          >
            <span>{showCompleted ? "▾" : "▸"}</span>
            Completed ({completed.length})
          </button>
          <AnimatePresence>
            {showCompleted && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="space-y-1.5 overflow-hidden"
              >
                {completed.map((t) => (
                  <TaskCard key={t.id} task={t} onUncomplete={handleUncomplete} disabled={isPending} />
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      )}
    </>
  );
}
