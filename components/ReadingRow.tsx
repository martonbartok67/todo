"use client";

/**
 * 📖 ReadingRow — a single reading entry (chapter / article).
 *
 * Used by `ReadingsDashboard` and `SubjectAccordion`. Calls the
 * server actions directly when the checkbox is toggled.
 *
 * If `onEdit` is passed, an edit button is rendered so the user can
 * open the reading in the side-sheet (Step 3 — manual readings).
 */
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
      className="flex items-start gap-3 rounded-xl bg-surface-1 border border-border px-3 py-2.5"
    >
      <button
        onClick={handleToggle}
        className={[
          "mt-0.5 shrink-0 w-5 h-5 rounded-full border border-border transition-all flex items-center justify-center",
          done ? "bg-foreground border-foreground" : "hover:border-[#6366f1]",
        ].join(" ")}
        aria-label={done ? "Mark unread" : "Mark read"}
      >
        {done && <span className="text-[10px] text-background leading-none">✓</span>}
      </button>

      <div className="flex-1 min-w-0">
        <p className={["text-sm leading-snug", done ? "line-through text-muted" : "text-foreground"].join(" ")}>
          {item.readingText}
        </p>
        {item.detail && (
          <p className="text-[11px] text-muted mt-0.5">{item.detail}</p>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
        {item.sourcePageUrl && (
          <a href={item.sourcePageUrl} target="_blank" rel="noopener noreferrer"
             className="text-muted hover:text-foreground transition-colors text-xs">↗</a>
        )}
        {onEdit && (
          <button
            onClick={() => onEdit(item)}
            className="text-muted hover:text-foreground transition-colors text-xs"
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
