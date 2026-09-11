"use client";
import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { completeTask, uncompleteTask } from "@/app/actions/tasks";
import type { EnrichedTask, UrgencyLevel } from "@/lib/tasks";
import { formatDateTimeShort } from "@/lib/format";

const URGENCY_COLOR: Record<UrgencyLevel, string> = {
  critical: "var(--urgency-critical)",
  high:     "var(--urgency-high)",
  medium:   "var(--urgency-medium)",
  low:      "var(--urgency-low)",
  none:     "var(--muted)",
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
  const urgencyColor = URGENCY_COLOR[done ? "none" : task.urgency];

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
      style={{
        borderBottom: "1px solid var(--border)",
        opacity: isPending ? 0.6 : 1,
        transition: "opacity 0.15s",
      }}
    >
      <div
        className="flex items-start gap-3"
        style={{ padding: "14px" }}
      >
        {/* 22×22 circle checkbox */}
        <button
          disabled={disabled || isPending}
          onClick={handleToggle}
          style={{
            marginTop: "1px",
            flexShrink: 0,
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            border: `2px solid ${done ? "var(--muted)" : urgencyColor}`,
            background: done ? "var(--muted)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.4 : 1,
            transition: "all 0.15s",
          }}
          aria-label={done ? "Mark incomplete" : "Mark complete"}
        >
          {done && (
            <span style={{ color: "white", fontSize: "10px", fontWeight: 700, lineHeight: 1 }}>✓</span>
          )}
        </button>

        {/* Content */}
        <div
          className="flex-1 min-w-0"
          style={{ cursor: hasContent ? "pointer" : "default" }}
          onClick={() => hasContent && setExpanded(v => !v)}
        >
          {/* Title row */}
          <div className="flex items-start gap-1.5">
            <p
              style={{
                fontSize: "14px",
                fontWeight: 600,
                lineHeight: 1.3,
                flex: 1,
                minWidth: 0,
                color: done ? "var(--muted)" : "var(--foreground)",
                textDecoration: done ? "line-through" : "none",
              }}
            >
              {task.title}
            </p>
            {hasContent && (
              <span style={{ flexShrink: 0, color: "var(--muted)", fontSize: "9px", marginTop: "2px" }}>
                {expanded ? "▴" : "▾"}
              </span>
            )}
          </div>

          {/* Metadata row */}
          <div className="flex items-center gap-1 flex-wrap" style={{ marginTop: "4px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)" }}>
              {task.courseName}
            </span>
            {typeLabel && (
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>· {typeLabel}</span>
            )}
            {task.pointsPossible != null && (
              <span style={{ fontSize: "11px", color: "var(--muted)" }} className="tabular-nums">
                · {task.pointsPossible}pt
              </span>
            )}
            <span className="ml-auto shrink-0">
              {task.dueAt && !done && (
                <span
                  style={{ fontSize: "12px", fontWeight: 700, color: urgencyColor }}
                  className="tabular-nums"
                >
                  {formatDateTimeShort(task.dueAt)}
                </span>
              )}
              {done && task.completedAt && (
                <span style={{ fontSize: "11px", color: "var(--muted)" }} className="tabular-nums">
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
            style={{ flexShrink: 0, color: "var(--muted)", fontSize: "14px", marginTop: "2px" }}
            className="hover:opacity-80 transition-opacity"
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
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 14px 14px", borderTop: "1px solid var(--border)" }}>
              <p style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.6, marginTop: "10px", whiteSpace: "pre-wrap" }}>
                {task.description}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
