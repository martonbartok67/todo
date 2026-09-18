"use client";
import { forwardRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { completeTask, uncompleteTask } from "@/app/actions/tasks";
import type { EnrichedTask, UrgencyLevel } from "@/lib/tasks";
import { formatDateTimeShort } from "@/lib/format";
import { courseColor } from "@/lib/colors";

const URGENCY_COLOR: Record<UrgencyLevel, string> = {
  critical: "var(--urgency-critical)",
  high:     "var(--urgency-high)",
  medium:   "var(--urgency-medium)",
  low:      "var(--urgency-low)",
  none:     "var(--muted)",
};

const ITEM_TYPE_LABEL: Record<string, string> = {
  online_upload:    "Upload",
  discussion_topic: "Discussion",
  online_quiz:      "Quiz",
  external_tool:    "External",
  Page:             "Page",
  File:             "File",
  ExternalUrl:      "Link",
  Assignment:       "Assignment",
  Quiz:             "Quiz",
  Discussion:       "Discussion",
};

type TaskCardProps = {
  task:          EnrichedTask;
  /** `alsoIds` carries the rolled-up satellites, so they complete together. */
  onComplete?:   (id: number, alsoIds?: number[]) => void;
  onUncomplete?: (id: number, alsoIds?: number[]) => void;
  disabled?:     boolean;
  /** Suppress the course name — redundant inside a per-subject group. */
  hideCourse?:   boolean;
};

/**
 * forwardRef is not optional here: these rows render inside
 * `<AnimatePresence mode="popLayout">`, and Framer Motion's PopChild needs
 * to attach a ref to its direct child to measure it during exit. Without it
 * React logs "Function components cannot be given refs" and the pop-out
 * animation measures nothing.
 */
export const TaskCard = forwardRef<HTMLLIElement, TaskCardProps>(function TaskCard({
  task, onComplete, onUncomplete, disabled, hideCourse,
}, ref) {
  const [expanded, setExpanded]      = useState(false);
  const [isPending, startTransition] = useTransition();

  const done         = !!task.completedAt;
  // Clips/slides/recordings this unit absorbed (lib/unit-rollup.ts). They
  // are not rows of their own any more, so the card is the only place
  // they can still be seen, opened and ticked off individually.
  const rolledUp     = task.rolledUp ?? [];
  const rolledUpIds  = rolledUp.map((c) => c.id);
  const hasContent   = !!task.description || rolledUp.length > 0;
  const typeLabel    = task.itemType ? (ITEM_TYPE_LABEL[task.itemType] ?? null) : null;
  const urgencyColor = URGENCY_COLOR[done ? "none" : task.urgency];
  const accent       = courseColor(task.courseName);

  // A deadline we derived from the timetable is worth flagging: it is an
  // inference from the lecture schedule, not something Canvas published.
  const fromTimetable = task.deadlineSource === "timetable";

  const handleToggle = () => {
    startTransition(() => {
      if (done) (onUncomplete ?? uncompleteTask)(task.id, rolledUpIds);
      else      (onComplete   ?? completeTask)(task.id, rolledUpIds);
    });
  };

  /** Tick off one absorbed satellite without touching its unit. */
  const handleChildToggle = (childId: number) => {
    startTransition(() => { completeTask(childId); });
  };

  return (
    <motion.li
      ref={ref}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="row relative"
      style={{ opacity: isPending ? 0.55 : 1, transition: "opacity 0.15s" }}
    >
      {/* Urgency rail — a 3px bar rather than a coloured word, so the list
          scans vertically without reading anything. */}
      {!done && (
        <span
          aria-hidden
          style={{
            position: "absolute", left: 0, top: 6, bottom: 6, width: "3px",
            borderRadius: "0 3px 3px 0", background: urgencyColor,
            opacity: task.urgency === "none" ? 0.25 : 1,
          }}
        />
      )}

      <div className="flex items-start gap-3" style={{ padding: "13px 14px 13px 16px" }}>
        {/* Checkbox */}
        <button
          disabled={disabled || isPending}
          onClick={handleToggle}
          className="tap-target"
          style={{
            marginTop: "1px", flexShrink: 0,
            width: "21px", height: "21px", borderRadius: "50%",
            border: `2px solid ${done ? "var(--accent)" : urgencyColor}`,
            background: done ? "var(--accent)" : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.4 : 1,
            transition: "all var(--dur) var(--ease)",
          }}
          aria-label={done ? "Mark incomplete" : "Mark complete"}
        >
          {done && (
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"
                 stroke="var(--accent-fg)" strokeWidth="2.4"
                 strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.4 L4.8 8.7 L9.5 3.6" />
            </svg>
          )}
        </button>

        {/* Content */}
        <div
          className="flex-1 min-w-0"
          style={{ cursor: hasContent ? "pointer" : "default" }}
          onClick={() => hasContent && setExpanded((v) => !v)}
        >
          <div className="flex items-start gap-1.5">
            <p
              className="task-title"
              style={{
                fontSize: "14.5px", fontWeight: 700, lineHeight: 1.35,
                flex: 1, minWidth: 0, letterSpacing: "-0.01em",
                color: done ? "var(--muted)" : "var(--foreground)",
                textDecoration: done ? "line-through" : "none",
              }}
            >
              {task.title}
            </p>
            {hasContent && (
              <span style={{
                flexShrink: 0, color: "var(--muted)", fontSize: "10px",
                marginTop: "3px", transition: "transform var(--dur) var(--ease)",
                transform: expanded ? "rotate(180deg)" : "none",
                display: "inline-block",
              }}>▾</span>
            )}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-x-2 gap-y-1 flex-wrap" style={{ marginTop: "6px" }}>
            {!hideCourse && (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span aria-hidden style={{
                  width: "6px", height: "6px", borderRadius: "50%",
                  background: accent, flexShrink: 0,
                }} />
                <span
                  className="truncate"
                  style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--muted)", maxWidth: "150px" }}
                >
                  {task.courseName}
                </span>
              </span>
            )}

            {typeLabel && (
              <span style={{ fontSize: "11px", color: "var(--muted)", opacity: 0.8 }}>{typeLabel}</span>
            )}
            {task.pointsPossible != null && (
              <span className="tabular-nums" style={{ fontSize: "11px", color: "var(--muted)", opacity: 0.8 }}>
                {task.pointsPossible} pt
              </span>
            )}
            {rolledUp.length > 0 && (
              <span
                className="tabular-nums"
                title={`Includes ${rolledUp.length} item${rolledUp.length === 1 ? "" : "s"} for this unit — tap to list them`}
                style={{
                  fontSize: "10.5px", fontWeight: 700, color: accent,
                  background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                  borderRadius: "999px", padding: "1px 7px", lineHeight: 1.5,
                }}
              >
                +{rolledUp.length}
              </span>
            )}

            <span className="ml-auto shrink-0 flex items-center gap-1.5">
              {task.dueAt && !done && (
                <span
                  className="chip tabular-nums"
                  style={{ color: urgencyColor }}
                  title={fromTimetable ? "Derived from the lecture timetable" : undefined}
                >
                  {fromTimetable && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2.6"
                         strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <rect x="3" y="4.5" width="18" height="17" rx="3" />
                      <path d="M8 2.5v4M16 2.5v4M3 10h18" />
                    </svg>
                  )}
                  {formatDateTimeShort(task.dueAt)}
                </span>
              )}
              {done && task.completedAt && (
                <span className="tabular-nums" style={{ fontSize: "11px", color: "var(--muted)" }}>
                  ✓ {formatDateTimeShort(task.completedAt)}
                </span>
              )}
            </span>
          </div>
        </div>

        {task.url && (
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="tap-target hover:opacity-70 transition-opacity"
            style={{ flexShrink: 0, color: "var(--muted)", padding: "3px", lineHeight: 0 }}
            aria-label="Open in Canvas"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 4h6v6M20 4l-8.5 8.5" />
              <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
            </svg>
          </a>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && hasContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div style={{
              margin: "0 14px 14px 16px", padding: "11px 13px",
              background: "var(--surface-1)", borderRadius: "var(--r-md)",
            }}>
              {task.description && (
                <p style={{
                  fontSize: "12.5px", color: "var(--foreground-soft)",
                  lineHeight: 1.65, whiteSpace: "pre-wrap",
                }}>
                  {task.description}
                </p>
              )}

              {rolledUp.length > 0 && (
                <div style={{ marginTop: task.description ? "11px" : 0 }}>
                  <p className="section-label" style={{
                    fontSize: "10.5px", fontWeight: 700, color: "var(--muted)",
                    letterSpacing: "0.04em", textTransform: "uppercase",
                    marginBottom: "6px",
                  }}>
                    Part of this unit
                  </p>
                  <ul style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {rolledUp.map((child) => (
                      <li
                        key={child.id}
                        className="flex items-center gap-2"
                        style={{ padding: "3px 0" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          disabled={disabled || isPending}
                          onClick={() => handleChildToggle(child.id)}
                          className="tap-target"
                          style={{
                            flexShrink: 0, width: "14px", height: "14px",
                            borderRadius: "50%", border: "1.8px solid var(--muted)",
                            background: "transparent",
                            cursor: disabled ? "not-allowed" : "pointer",
                            opacity: disabled ? 0.4 : 0.7,
                          }}
                          aria-label={`Mark "${child.title}" complete`}
                        />
                        <span
                          className="truncate"
                          style={{ fontSize: "12px", color: "var(--foreground-soft)", flex: 1, minWidth: 0 }}
                        >
                          {child.title}
                        </span>
                        {child.pointsPossible != null && (
                          <span className="tabular-nums shrink-0" style={{
                            fontSize: "10.5px", color: "var(--muted)", opacity: 0.8,
                          }}>
                            {child.pointsPossible} pt
                          </span>
                        )}
                        {child.url && (
                          <a
                            href={child.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tap-target hover:opacity-70 transition-opacity shrink-0"
                            style={{ color: "var(--muted)", padding: "2px", lineHeight: 0 }}
                            aria-label={`Open "${child.title}" in Canvas`}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 4h6v6M20 4l-8.5 8.5" />
                              <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
                            </svg>
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
});
