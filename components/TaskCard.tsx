"use client";

/**
 * 🃏 TaskCard — a single row in the Tasks list.
 *
 * Shared by `TaskDashboard` (the / page) and `SubjectAccordion` (the
 * /subjects/[course_id] page). Owns its own "expanded" state for the
 * description disclosure.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { completeTask, uncompleteTask } from "@/app/actions/tasks";
import type { EnrichedTask, UrgencyLevel } from "@/lib/tasks";
import { formatDateTimeShort } from "@/lib/format";

const URGENCY_DOT: Record<UrgencyLevel, string> = {
  critical: "bg-[#ef4444]", high: "bg-[#f97316]",
  medium:   "bg-[#eab308]", low:  "bg-[#6366f1]", none: "bg-muted",
};
const URGENCY_RING: Record<UrgencyLevel, string> = {
  critical: "hover:border-[#ef4444]", high: "hover:border-[#f97316]",
  medium:   "hover:border-[#eab308]", low:  "hover:border-[#6366f1]",
  none:     "hover:border-[#6366f1]",
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

function formatDue(ts: string) {
  // "09 Jul, 15:15" — short date + time, no year.
  return formatDateTimeShort(ts);
}

export function TaskCard({
  task, onComplete, onUncomplete, disabled,
}: {
  task:            EnrichedTask;
  onComplete?:     (id: number) => void;
  onUncomplete?:   (id: number) => void;
  disabled?:       boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const done        = !!task.completedAt;
  const hasContent  = !!task.description;
  const typeLabel   = task.itemType ? (ITEM_TYPE_LABEL[task.itemType] ?? task.itemType) : null;

  // If the parent passes handlers, use them (TaskDashboard batches
  // multiple toggles via useTransition). Otherwise call the server
  // action directly — SubjectAccordion uses this path.
  const handleToggle = () => {
    if (done && onUncomplete) onUncomplete(task.id);
    else if (!done && onComplete) onComplete(task.id);
    else if (done) uncompleteTask(task.id);
    else completeTask(task.id);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.16 }}
      className="rounded-xl bg-surface-1 border border-border overflow-hidden"
    >
      <div className="flex items-start gap-3 px-3 py-2.5">
        <button
          disabled={disabled}
          onClick={handleToggle}
          className={[
            "mt-0.5 shrink-0 w-5 h-5 rounded-full border border-border transition-all flex items-center justify-center",
            done ? "bg-foreground border-foreground" : URGENCY_RING[task.urgency],
            disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
          aria-label={done ? "Mark incomplete" : "Mark complete"}
        >
          {done && <span className="text-[10px] text-background leading-none">✓</span>}
        </button>

        <div
          className={["flex-1 min-w-0", hasContent ? "cursor-pointer" : ""].join(" ")}
          onClick={() => hasContent && setExpanded((v) => !v)}
        >
          <div className="flex items-start gap-1.5">
            <p className={["text-sm font-medium leading-snug flex-1 min-w-0", done ? "line-through text-muted" : "text-foreground"].join(" ")}>
              {task.title}
            </p>
            {hasContent && (
              <span className="shrink-0 text-muted text-[10px] mt-0.5 select-none">
                {expanded ? "▴" : "▾"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${URGENCY_DOT[task.urgency]}`} />
            <span className="text-[11px] text-muted truncate">{task.courseName}</span>
            {typeLabel && (
              <span className="text-[10px] text-muted bg-surface-2 border border-border rounded px-1 py-0.5 leading-none">
                {typeLabel}
              </span>
            )}
            {task.pointsPossible != null && (
              <span className="text-[10px] text-muted tabular-nums">{task.pointsPossible} pts</span>
            )}
            {task.dueAt && !done && (
              <span className="text-[11px] text-muted ml-auto shrink-0 tabular-nums">{formatDue(task.dueAt)}</span>
            )}
            {done && task.completedAt && (
              <span className="text-[11px] text-muted ml-auto shrink-0 tabular-nums">Done {formatDue(task.completedAt)}</span>
            )}
          </div>
        </div>

        {task.url && (
          <a href={task.url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 text-muted hover:text-foreground transition-colors mt-0.5 text-xs">↗</a>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-0 border-t border-border">
              <p className="text-[12px] text-muted leading-relaxed whitespace-pre-wrap mt-2.5">
                {task.description}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
