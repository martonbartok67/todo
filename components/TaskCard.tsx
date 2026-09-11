"use client";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { completeTask, uncompleteTask } from "@/app/actions/tasks";
import type { EnrichedTask, UrgencyLevel } from "@/lib/tasks";
import { formatDateTimeShort } from "@/lib/format";

const URGENCY_LEFT: Record<UrgencyLevel, string> = {
  critical: "border-l-[#ef4444]",
  high:     "border-l-[#f97316]",
  medium:   "border-l-[#eab308]",
  low:      "border-l-[#6366f1]",
  none:     "border-l-transparent",
};

const URGENCY_DOT: Record<UrgencyLevel, string> = {
  critical: "bg-[#ef4444]", high: "bg-[#f97316]",
  medium:   "bg-[#eab308]", low:  "bg-[#6366f1]", none: "bg-muted",
};

const URGENCY_RING: Record<UrgencyLevel, string> = {
  critical: "hover:border-[#ef4444]", high: "hover:border-[#f97316]",
  medium:   "hover:border-[#eab308]", low:  "hover:border-[#6366f1]",
  none:     "hover:border-muted",
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  online_upload:     "Upload",
  discussion_topic:  "Discussion",
  online_quiz:       "Quiz",
  external_tool:     "External",
  Page:              "Page",
  File:              "File",
  ExternalUrl:       "Link",
  Assignment:        "Assignment",
  Quiz:              "Quiz",
  Discussion:        "Discussion",
};

export function TaskCard({
  task, onComplete, onUncomplete, disabled,
}: {
  task:           EnrichedTask;
  onComplete?:    (id: number) => void;
  onUncomplete?:  (id: number) => void;
  disabled?:      boolean;
}) {
  const [expanded, setExpanded]       = useState(false);
  const [isPending, startTransition]  = useTransition();
  const done       = !!task.completedAt;
  const hasContent = !!task.description;
  const typeLabel  = task.itemType ? (ITEM_TYPE_LABEL[task.itemType] ?? null) : null;

  const handleToggle = () => {
    startTransition(() => {
      if (done) {
        if (onUncomplete) onUncomplete(task.id);
        else uncompleteTask(task.id);
      } else {
        if (onComplete) onComplete(task.id);
        else completeTask(task.id);
      }
    });
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.15 }}
      className={[
        "rounded-xl bg-surface-1 border border-border border-l-2 overflow-hidden transition-opacity",
        URGENCY_LEFT[done ? "none" : task.urgency],
        isPending ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3 px-3 py-3">
        {/* Complete toggle */}
        <button
          disabled={disabled || isPending}
          onClick={handleToggle}
          className={[
            "mt-0.5 shrink-0 w-[18px] h-[18px] rounded-full border transition-all flex items-center justify-center",
            done
              ? "bg-foreground border-foreground"
              : ["border-border", URGENCY_RING[task.urgency]].join(" "),
            disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
          ].join(" ")}
          aria-label={done ? "Mark incomplete" : "Mark complete"}
        >
          {done && <span className="text-[9px] text-background leading-none font-bold">✓</span>}
        </button>

        {/* Content */}
        <div
          className={["flex-1 min-w-0", hasContent ? "cursor-pointer" : ""].join(" ")}
          onClick={() => hasContent && setExpanded(v => !v)}
        >
          <div className="flex items-start gap-1.5">
            <p className={[
              "text-[13px] font-medium leading-snug flex-1 min-w-0",
              done ? "line-through text-muted" : "text-foreground",
            ].join(" ")}>
              {task.title}
            </p>
            {hasContent && (
              <span className="shrink-0 text-muted/50 text-[9px] mt-0.5 select-none">
                {expanded ? "▴" : "▾"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${URGENCY_DOT[done ? "none" : task.urgency]}`} />
            <span className="text-[11px] text-muted truncate">{task.courseName}</span>
            {typeLabel && (
              <span className="text-[10px] text-muted/70 bg-surface-2 border border-border rounded-md px-1.5 py-0.5 leading-none">
                {typeLabel}
              </span>
            )}
            {task.pointsPossible != null && (
              <span className="text-[10px] text-muted tabular-nums">{task.pointsPossible}pt</span>
            )}
            <span className="ml-auto shrink-0">
              {task.dueAt && !done && (
                <span className="text-[11px] text-muted tabular-nums">
                  {formatDateTimeShort(task.dueAt)}
                </span>
              )}
              {done && task.completedAt && (
                <span className="text-[11px] text-muted tabular-nums">
                  ✓ {formatDateTimeShort(task.completedAt)}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* External link */}
        {task.url && (
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="shrink-0 text-muted/60 hover:text-foreground transition-colors mt-0.5 text-sm"
          >↗</a>
        )}
      </div>

      {/* Expandable description */}
      <AnimatePresence initial={false}>
        {expanded && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
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
