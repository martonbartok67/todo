"use client";

/**
 * 📚 SubjectAccordion — the per-course page's collapsible panels.
 *
 * Three sections: Tasks / Readings / Resources (Resources is empty for
 * now — it'll light up after Step 2 introduces AI classification).
 *
 * Each section has its own open/closed state so the user can focus on
 * one thing at a time. Animations match the rest of the app (height +
 * opacity, ~200ms).
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { EnrichedTask } from "@/lib/tasks";
import type { ReadingItem } from "@/drizzle/schema";
import { TaskCard } from "./TaskCard";
import { ReadingRow } from "./ReadingRow";

export type SubjectResources = {
  // Resource rows from `tasks` where classification = "info". Empty
  // until Step 2 ships.
  items: Array<{
    id: number;
    title: string;
    detail: string | null;
    url: string | null;
  }>;
};

type Section = "tasks" | "readings" | "resources";

export function SubjectAccordion({
  tasks,
  readings,
  resources,
  courseAccent,
}: {
  tasks:        EnrichedTask[];
  readings:     ReadingItem[];
  resources:    SubjectResources;
  courseAccent: string | null;
}) {
  const [open, setOpen] = useState<Record<Section, boolean>>({
    tasks:     true,   // tasks open by default — that's the main reason you're here
    readings:  false,
    resources: false,
  });

  const toggle = (s: Section) => setOpen((o) => ({ ...o, [s]: !o[s] }));

  return (
    <div className="space-y-3">
      <Section
        title="Tasks"
        count={tasks.length}
        isOpen={open.tasks}
        onToggle={() => toggle("tasks")}
        accent={courseAccent}
      >
        {tasks.length === 0 ? (
          <p className="text-sm text-muted px-4 py-6">No tasks for this subject.</p>
        ) : (
          <ul className="space-y-1.5 p-3">
            {tasks.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Readings"
        count={readings.length}
        isOpen={open.readings}
        onToggle={() => toggle("readings")}
        accent={courseAccent}
      >
        {readings.length === 0 ? (
          <p className="text-sm text-muted px-4 py-6">
            No readings extracted yet for this subject.
          </p>
        ) : (
          <ul className="space-y-1.5 p-3">
            {readings.map((r) => (
              <ReadingRow key={r.id} item={r} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Resources"
        count={resources.items.length}
        isOpen={open.resources}
        onToggle={() => toggle("resources")}
        accent={courseAccent}
        badge="Coming soon"
      >
        {resources.items.length === 0 ? (
          <div className="text-sm text-muted px-4 py-6 space-y-1">
            <p>No resources classified yet.</p>
            <p className="text-[11px] text-muted/80">
              Once the AI classification pass lands (next milestone),
              informational files like syllabi and formula sheets will
              appear here instead of cluttering your task list.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5 p-3">
            {resources.items.map((r) => (
              <li key={r.id} className="rounded-xl bg-surface-1 border border-border px-3 py-2.5">
                <p className="text-sm font-medium">{r.title}</p>
                {r.detail && <p className="text-[11px] text-muted mt-0.5">{r.detail}</p>}
                {r.url && (
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                     className="text-[11px] text-muted hover:text-foreground mt-1 inline-block">
                    Open ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title, count, isOpen, onToggle, accent, badge, children,
}: {
  title:    string;
  count:    number;
  isOpen:   boolean;
  onToggle: () => void;
  accent:   string | null;
  badge?:   string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl bg-surface-1 border border-border overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-2 transition-colors"
      >
        {accent && (
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
        )}
        <span className="text-sm font-semibold tracking-tight flex-1 text-left">
          {title}
        </span>
        <span className="text-[11px] text-muted">{count}</span>
        {badge && (
          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-3 text-muted">
            {badge}
          </span>
        )}
        <span className="text-muted text-xs ml-1 select-none">
          {isOpen ? "▴" : "▾"}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
