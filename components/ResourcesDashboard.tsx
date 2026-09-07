"use client";

/**
 * 📚 ResourcesDashboard — the informational-items tab (Step 2).
 *
 * Each row is a Canvas item the AI classified as "info" (not a thing
 * to do — just a document, syllabus, recording, etc.). Same underlying
 * `tasks` table as the actionable list; just filtered + grouped here.
 *
 * Items are grouped by course so the user can quickly skim "what does
 * Marketing have that's informational" vs "what does Math have".
 */
import { motion, AnimatePresence } from "framer-motion";
import type { EnrichedResource } from "@/lib/tasks";

function fallbackColor(name: string): string {
  const colors = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[Math.abs(h)];
}

function groupByCourse(items: EnrichedResource[]): Array<{
  courseName:     string;
  courseCanvasId: string;
  accent:         string | null;
  items:          EnrichedResource[];
}> {
  const m = new Map<string, { courseName: string; courseCanvasId: string; accent: string | null; items: EnrichedResource[] }>();
  for (const it of items) {
    if (!m.has(it.courseCanvasId)) {
      m.set(it.courseCanvasId, {
        courseName: it.courseName,
        courseCanvasId: it.courseCanvasId,
        accent: it.accentColor,
        items: [],
      });
    }
    m.get(it.courseCanvasId)!.items.push(it);
  }
  return Array.from(m.values()).sort((a, b) => a.courseName.localeCompare(b.courseName));
}

export function ResourcesDashboard({ items }: { items: EnrichedResource[] }) {
  const groups = groupByCourse(items);

  return (
    <>
      <header className="mb-5">
        <h1 className="text-lg md:text-base font-semibold tracking-tight">Resources</h1>
        <p className="text-xs text-muted mt-0.5 tabular-nums">
          {items.length > 0
            ? `${items.length} informational ${items.length === 1 ? "item" : "items"} · AI-classified from Canvas modules`
            : "Informational files (syllabi, formula sheets, recordings) appear here"}
        </p>
      </header>

      {items.length === 0 && (
        <div className="rounded-xl bg-surface-1 border border-border px-4 py-5 text-sm text-muted space-y-2">
          <p className="text-foreground font-medium">No resources classified yet</p>
          <p>
            Run a manual classification pass to flag informational Canvas
            items. Hit <code className="font-mono text-foreground/80">POST /api/sync?phase=classify&courseId=YOUR_COURSE_ID</code>{" "}
            (with the <code className="font-mono text-foreground/80">Authorization: Bearer $CRON_SECRET</code>{" "}
            header) for each of your courses, or trigger one from the
            cron workflow.
          </p>
          <p className="text-[11px] text-muted/80">
            Until then, every Canvas item shows up in the Tasks list.
          </p>
        </div>
      )}

      {groups.map((g) => {
        const accent = g.accent ?? fallbackColor(g.courseName);
        return (
          <section key={g.courseCanvasId} className="mb-6">
            <div className="flex items-center gap-2 mb-2.5 px-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted flex-1 truncate">
                {g.courseName}
              </p>
              <span className="text-[11px] text-muted/70 tabular-nums">{g.items.length}</span>
            </div>
            <ul className="space-y-1.5">
              <AnimatePresence mode="popLayout">
                {g.items.map((it) => (
                  <motion.li
                    key={it.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.15 }}
                    className="rounded-xl bg-surface-1 border border-border px-3 py-2.5"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        aria-hidden
                        className="mt-1 w-1.5 h-1.5 rounded-full bg-muted/50 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-snug text-foreground">{it.title}</p>
                        {it.classificationReason && (
                          <p className="text-[11px] text-muted mt-0.5 italic">
                            {it.classificationReason}
                          </p>
                        )}
                        {it.itemType && (
                          <p className="text-[10px] text-muted/70 mt-1 uppercase tracking-wider font-mono">
                            {it.itemType}
                          </p>
                        )}
                      </div>
                      {it.url && (
                        <a href={it.url} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 text-muted hover:text-foreground transition-colors mt-0.5 text-xs">↗</a>
                      )}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </section>
        );
      })}
    </>
  );
}
