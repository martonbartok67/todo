"use client";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { completeTask, uncompleteTask } from "@/app/actions/tasks";
import type { EnrichedTask } from "@/lib/tasks";
import type { SyncLog } from "@/drizzle/schema";

type Props = {
  pending:   EnrichedTask[];
  completed: EnrichedTask[];
  lastSync:  SyncLog | null;
};

const URGENCY_DOT: Record<string, string> = {
  critical: "bg-[#ef4444]",
  high:     "bg-[#f97316]",
  medium:   "bg-[#eab308]",
  low:      "bg-[#6366f1]",
  none:     "bg-[#374151]",
};

const URGENCY_RING: Record<string, string> = {
  critical: "hover:border-[#ef4444]",
  high:     "hover:border-[#f97316]",
  medium:   "hover:border-[#eab308]",
  low:      "hover:border-[#6366f1]",
  none:     "hover:border-[#6366f1]",
};

const SECTION_LABELS: Record<string, { label: string; color: string }> = {
  critical: { label: "Overdue / Due < 24h", color: "text-[#ef4444]" },
  high:     { label: "Due within 48h",      color: "text-[#f97316]" },
  medium:   { label: "This week",           color: "text-[#eab308]" },
  low:      { label: "Upcoming",            color: "text-[#6366f1]" },
  none:     { label: "No due date",         color: "text-[#6b7280]" },
};

function formatDue(dueAt: string): string {
  return new Date(dueAt).toLocaleDateString("en-NL", {
    month:  "short",
    day:    "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

function TaskCard({
  task,
  onComplete,
  onUncomplete,
  isPending,
}: {
  task:        EnrichedTask;
  onComplete?: (id: number) => void;
  onUncomplete?: (id: number) => void;
  isPending:   boolean;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.18 }}
      className="flex items-start gap-3 rounded-xl bg-[#111118] border border-[#2a2a3a] px-3 py-2.5 group"
    >
      {/* Complete / undo button */}
      <button
        disabled={isPending}
        onClick={() =>
          task.completedAt
            ? onUncomplete?.(task.id)
            : onComplete?.(task.id)
        }
        className={[
          "mt-0.5 shrink-0 w-5 h-5 rounded-full border border-[#2a2a3a] transition-all",
          task.completedAt
            ? "bg-[#6366f1] border-[#6366f1]"
            : URGENCY_RING[task.urgency],
          isPending ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
        ].join(" ")}
        aria-label={task.completedAt ? "Mark incomplete" : "Mark complete"}
      >
        {task.completedAt && (
          <span className="flex items-center justify-center w-full h-full text-[10px] text-white">✓</span>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={[
          "text-sm font-medium leading-snug truncate",
          task.completedAt ? "line-through text-[#6b7280]" : "",
        ].join(" ")}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${URGENCY_DOT[task.urgency]}`} />
          <span className="text-[11px] text-[#6b7280] truncate">{task.courseName}</span>
          {task.dueAt && !task.completedAt && (
            <span className="text-[11px] text-[#6b7280] ml-auto shrink-0">
              {formatDue(task.dueAt)}
            </span>
          )}
          {task.completedAt && (
            <span className="text-[11px] text-[#6b7280] ml-auto shrink-0">
              Done {formatDue(task.completedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Canvas link */}
      {task.url && (
        <a
          href={task.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-[#6b7280] hover:text-white transition-colors mt-0.5 text-xs"
          aria-label="Open in Canvas"
        >↗</a>
      )}
    </motion.li>
  );
}

export default function TaskDashboard({ pending, completed, lastSync }: Props) {
  const [isPending, startTransition] = useTransition();
  const [showCompleted, setShowCompleted] = useState(false);

  function handleComplete(id: number) {
    startTransition(() => { completeTask(id); });
  }

  function handleUncomplete(id: number) {
    startTransition(() => { uncompleteTask(id); });
  }

  // Group pending by urgency in display order
  const urgencyOrder = ["critical", "high", "medium", "low", "none"] as const;
  const groups = urgencyOrder
    .map((u) => ({ urgency: u, tasks: pending.filter((t) => t.urgency === u) }))
    .filter((g) => g.tasks.length > 0);

  return (
    <>
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
          {lastSync && (
            <p className="text-xs text-[#6b7280] mt-0.5">
              Synced {new Date(lastSync.startedAt).toLocaleString()} · {lastSync.tasksUpserted} items
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-[#6b7280]">
          <span>{pending.length} pending</span>
          {completed.length > 0 && (
            <span className="text-[#6366f1]">· {completed.length} done</span>
          )}
        </div>
      </header>

      {/* Empty state */}
      {pending.length === 0 && (
        <div className="text-center py-16 text-[#6b7280] text-sm">
          No pending tasks.
        </div>
      )}

      {/* Pending — grouped by urgency */}
      <AnimatePresence mode="popLayout">
        {groups.map(({ urgency, tasks }) => (
          <motion.section key={urgency} layout className="mb-5">
            <p className={`text-[11px] font-medium uppercase tracking-widest mb-2 ${SECTION_LABELS[urgency].color}`}>
              {SECTION_LABELS[urgency].label}
            </p>
            <ul className="space-y-1.5">
              <AnimatePresence mode="popLayout">
                {tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={handleComplete}
                    isPending={isPending}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </motion.section>
        ))}
      </AnimatePresence>

      {/* Completed section */}
      {completed.length > 0 && (
        <section className="mt-6 border-t border-[#2a2a3a] pt-4">
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="flex items-center gap-2 text-[11px] font-medium text-[#6b7280] uppercase tracking-widest w-full mb-2 hover:text-white transition-colors"
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
                transition={{ duration: 0.2 }}
                className="space-y-1.5 overflow-hidden"
              >
                {completed.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onUncomplete={handleUncomplete}
                    isPending={isPending}
                  />
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      )}
    </>
  );
}
