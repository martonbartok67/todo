"use client";

import { motion } from "framer-motion";
import { completeReading, uncompleteReading } from "@/app/actions/readings";
import type { ReadingItem } from "@/drizzle/schema";

export function ReadingRow({
  item, onComplete, onUncomplete, onEdit,
}: {
  item:           ReadingItem;
  onComplete?:    (id: number) => void;
  onUncomplete?:  (id: number) => void;
  onEdit?:        (item: ReadingItem) => void;
}) {
  const done = !!item.completedAt;
  const handleToggle = () => {
    if (done && onUncomplete) onUncomplete(item.id);
    else if (!done && onComplete) onComplete(item.id);
    else if (done) uncompleteReading(item.id);
    else completeReading(item.id);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.15 }}
      className="flex items-start gap-3"
      style={{ padding: "13px 14px", borderBottom: "1px solid var(--border)" }}
    >
      {/* 22×22 circle checkbox, accent-filled when done */}
      <button
        onClick={handleToggle}
        style={{
          marginTop: "1px",
          flexShrink: 0,
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          border: `2px solid ${done ? "var(--accent)" : "var(--border)"}`,
          background: done ? "var(--accent)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
        aria-label={done ? "Mark unread" : "Mark read"}
      >
        {done && (
          <span style={{ color: "var(--accent-fg)", fontSize: "10px", fontWeight: 700, lineHeight: 1 }}>✓</span>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <p
          style={{
            fontSize: "13px",
            fontWeight: 600,
            lineHeight: 1.4,
            color: done ? "var(--muted)" : "var(--foreground)",
            textDecoration: done ? "line-through" : "none",
          }}
        >
          {item.readingText}
        </p>
        {item.detail && (
          <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>{item.detail}</p>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1.5" style={{ marginTop: "2px" }}>
        {item.sourcePageUrl && (
          <a href={item.sourcePageUrl} target="_blank" rel="noopener noreferrer"
             style={{ color: "var(--muted)", fontSize: "12px" }}
             className="hover:opacity-80 transition-opacity"
          >↗</a>
        )}
        {onEdit && (
          <button
            onClick={() => onEdit(item)}
            style={{ color: "var(--muted)", fontSize: "12px", cursor: "pointer", background: "none", border: "none" }}
            className="hover:opacity-80 transition-opacity"
            aria-label="Edit reading"
            title="Edit"
          >
            ✎
          </button>
        )}
      </div>
    </motion.li>
  );
}
