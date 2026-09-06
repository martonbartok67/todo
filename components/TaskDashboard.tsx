"use client";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { completeTask, uncompleteTask } from "@/app/actions/tasks";
import type { EnrichedTask, CourseGroup, UrgencyLevel } from "@/lib/tasks";
import type { SyncLog } from "@/drizzle/schema";

type Props = {
  pending:   EnrichedTask[];
  byCourse:  CourseGroup[];
  completed: EnrichedTask[];
  lastSync:  SyncLog | null;
};

const URGENCY_DOT: Record<UrgencyLevel, string> = {
  critical: "bg-[#ef4444]", high: "bg-[#f97316]",
  medium:   "bg-[#eab308]", low:  "bg-[#6366f1]", none: "bg-[#374151]",
};
const URGENCY_RING: Record<UrgencyLevel, string> = {
  critical: "hover:border-[#ef4444]", high: "hover:border-[#f97316]",
  medium:   "hover:border-[#eab308]", low:  "hover:border-[#6366f1]",
  none:     "hover:border-[#6366f1]",
};
const URGENCY_SECTION: Record<UrgencyLevel, { label: string; color: string }> = {
  critical: { label: "Overdue / Due < 24h", color: "text-[#ef4444]" },
  high:     { label: "Due within 48h",      color: "text-[#f97316]" },
  medium:   { label: "This week",           color: "text-[#eab308]" },
  low:      { label: "Upcoming",            color: "text-[#6366f1]" },
  none:     { label: "No due date",         color: "text-[#6b7280]" },
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  online_upload:      "Upload",
  online_text_entry:  "Text entry",
  discussion_topic:   "Discussion",
  online_quiz:        "Quiz",
  external_tool:      "External tool",
  Page:               "Page",
  File:               "File",
  ExternalUrl:        "Link",
  Assignment:         "Assignment",
  Quiz:               "Quiz",
  Discussion:         "Discussion",
};

function fallbackColor(name: string): string {
  const colors = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[Math.abs(h)];
}

function formatDue(ts: string) {
  return new Date(ts).toLocaleDateString("en-NL", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function TaskCard({
  task, onComplete, onUncomplete, disabled,
}: {
  task: EnrichedTask;
  onComplete?:   (id: number) => void;
  onUncomplete?: (id: number) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const done        = !!task.completedAt;
  const hasContent  = !!task.description;
  const typeLabel   = task.itemType ? (ITEM_TYPE_LABEL[task.itemType] ?? task.itemType) : null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.16 }}
      className="rounded-xl bg-[#111118] border border-[#2a2a3a] overflow-hidden"
    >
      {/* ── Main row ── */}
      <div className="flex items-start gap-3 px-3 py-2.5">
        {/* Complete button */}
        <button
          disabled={disabled}
          onClick={() => done ? onUncomplete?.(task.id) : onComplete?.(task.id)}
          className={[
            "mt-0.5 shrink-0 w-5 h-5 rounded-full border border-[#2a2a3a] transition-all flex items-center justify-center",
            done ? "bg-[#6366f1] border-[#6366f1]" : URGENCY_RING[task.urgency],
            disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
          aria-label={done ? "Mark incomplete" : "Mark complete"}
        >
          {done && <span className="text-[10px] text-white leading-none">✓</span>}
        </button>

        {/* Title + meta — tappable to expand */}
        <div
          className={["flex-1 min-w-0", hasContent ? "cursor-pointer" : ""].join(" ")}
          onClick={() => hasContent && setExpanded((v) => !v)}
        >
          <div className="flex items-start gap-1.5">
            <p className={["text-sm font-medium leading-snug flex-1 min-w-0", done ? "line-through text-[#6b7280]" : ""].join(" ")}>
              {task.title}
            </p>
            {hasContent && (
              <span className="shrink-0 text-[#6b7280] text-[10px] mt-0.5 select-none">
                {expanded ? "▴" : "▾"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${URGENCY_DOT[task.urgency]}`} />
            <span className="text-[11px] text-[#6b7280] truncate">{task.courseName}</span>
            {typeLabel && (
              <span className="text-[10px] text-[#374151] bg-[#1a1a24] border border-[#2a2a3a] rounded px-1 py-0.5 leading-none">
                {typeLabel}
              </span>
            )}
            {task.pointsPossible != null && (
              <span className="text-[10px] text-[#6b7280]">{task.pointsPossible} pts</span>
            )}
            {task.dueAt && !done && (
              <span className="text-[11px] text-[#6b7280] ml-auto shrink-0">{formatDue(task.dueAt)}</span>
            )}
            {done && task.completedAt && (
              <span className="text-[11px] text-[#6b7280] ml-auto shrink-0">Done {formatDue(task.completedAt)}</span>
            )}
          </div>
        </div>

        {/* Canvas link */}
        {task.url && (
          <a href={task.url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 text-[#6b7280] hover:text-white transition-colors mt-0.5 text-xs">↗</a>
        )}
      </div>

      {/* ── Expandable content ── */}
      <AnimatePresence initial={false}>
        {expanded && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 border-t border-[#2a2a3a]">
              <p className="text-[12px] text-[#9ca3af] leading-relaxed whitespace-pre-wrap mt-2.5">
                {task.description}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
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
          <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
          {lastSync && (
            <p className="text-xs text-[#6b7280] mt-0.5">
              Synced {new Date(lastSync.startedAt).toLocaleString()} · {lastSync.tasksUpserted} items
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-[#6b7280] mr-2">{pending.length} pending</span>
          {(["urgency","course"] as ViewMode[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={[
                "px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors",
                view === v
                  ? "bg-[#6366f1] border-[#6366f1] text-white"
                  : "bg-[#111118] border-[#2a2a3a] text-[#6b7280] hover:text-white",
              ].join(" ")}
            >
              {v === "urgency" ? "Priority" : "Subject"}
            </button>
          ))}
        </div>
      </header>

      {pending.length === 0 && (
        <div className="text-center py-16 text-[#6b7280] text-sm">No pending tasks.</div>
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
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
                  <p className="text-[11px] font-medium uppercase tracking-widest text-[#6b7280]">
                    {group.courseName}
                  </p>
                  <span className="text-[11px] text-[#374151] ml-auto">{group.tasks.length}</span>
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
