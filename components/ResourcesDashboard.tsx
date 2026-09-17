"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { EnrichedResource } from "@/lib/tasks";
import { courseColor } from "@/lib/colors";

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

const FILE_ICON: Record<string, string> = {
  Page:        "📄",
  File:        "📎",
  ExternalUrl: "🔗",
  Assignment:  "📝",
  Quiz:        "📋",
  Discussion:  "💬",
};

export function ResourcesDashboard({ items }: { items: EnrichedResource[] }) {
  const groups = groupByCourse(items);

  return (
    <>
      {/* Sticky header */}
      <header className="page-header md:!static md:!backdrop-blur-none md:mb-5">
        <h1 className="page-title">
          Files
        </h1>
        <p className="page-subtitle">
          {items.length > 0
            ? `${items.length} ${items.length === 1 ? "item" : "items"} · AI-classified from Canvas`
            : "Syllabi, slides, and recordings appear here"}
        </p>
      </header>

      <div style={{ padding: "18px 16px", paddingBottom: "88px" }} className="md:!p-0">
        {items.length === 0 && (
          <div className="card" style={{ padding: "20px" }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--foreground)", marginBottom: "4px" }}>
              No resources yet
            </p>
            <p style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.6 }}>
              Resources include Canvas slides, files, and pages without a deadline.
              Trigger a sync to populate this list.
            </p>
          </div>
        )}

        {groups.map((g) => {
          const accent = courseColor(g.courseName, g.accent);
          return (
            <section key={g.courseCanvasId} style={{ marginBottom: "22px" }}>
              {/* Course header */}
              <div className="flex items-center gap-2" style={{ marginBottom: "8px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: accent, flexShrink: 0 }} />
                <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)", flex: 1, minWidth: 0 }} className="truncate">
                  {g.courseName}
                </p>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--muted)" }} className="tabular-nums">
                  {g.items.length}
                </span>
              </div>

              {/* Panel */}
              <div className="card">
                <AnimatePresence mode="popLayout">
                  {g.items.map((it, idx) => (
                    <motion.div
                      key={it.id}
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center gap-3"
                      style={{
                        padding: "13px 14px",
                        borderBottom: idx < g.items.length - 1 ? "1px solid var(--border)" : "none",
                      }}
                    >
                      {/* Icon container */}
                      <div
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "10px",
                          background: "var(--surface-1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          fontSize: "16px",
                        }}
                      >
                        {FILE_ICON[it.itemType ?? ""] ?? "📄"}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          style={{ fontSize: "13px", fontWeight: 600, color: "var(--foreground)" }}
                          className="truncate"
                        >
                          {it.title}
                        </p>
                        {it.itemType && (
                          <p className="page-subtitle">
                            {it.itemType}
                          </p>
                        )}
                      </div>

                      {it.url && (
                        <a
                          href={it.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ flexShrink: 0, color: "var(--muted)", fontSize: "14px" }}
                          className="hover:opacity-80 transition-opacity"
                        >↗</a>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
