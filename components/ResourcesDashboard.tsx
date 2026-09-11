"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { EnrichedResource } from "@/lib/tasks";

const COURSE_COLORS: Record<string, string> = {
  Economics:     "#2C6958",
  Mathematics:   "#7A4F83",
  Statistics:    "#286982",
  Marketing:     "#3D7C6F",
  Psychology:    "#C9991A",
  Strategy:      "#D4574D",
  Biology:       "#6B73AA",
  Communication: "#557AA3",
};

function courseColor(name: string, accent: string | null): string {
  if (accent) return accent;
  for (const [key, val] of Object.entries(COURSE_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return val;
  }
  const colors = ["#2C6958","#7A4F83","#286982","#3D7C6F","#C9991A","#D4574D","#6B73AA","#557AA3"];
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
      <header
        className="sticky top-0 z-30 md:relative"
        style={{
          paddingTop: "54px",
          paddingLeft: "18px",
          paddingRight: "18px",
          paddingBottom: "12px",
          background: "color-mix(in srgb, var(--background) 95%, transparent)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        <h1 style={{ fontSize: "24px", fontWeight: 800, lineHeight: 1.2, color: "var(--foreground)" }}>
          Files
        </h1>
        <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
          {items.length > 0
            ? `${items.length} ${items.length === 1 ? "item" : "items"} · AI-classified from Canvas`
            : "Syllabi, slides, and recordings appear here"}
        </p>
      </header>

      <div style={{ padding: "18px 16px", paddingBottom: "88px" }} className="md:!p-0">
        {items.length === 0 && (
          <div style={{ borderRadius: "16px", background: "var(--surface-card)", padding: "20px" }}>
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
              <div style={{ background: "var(--surface-card)", borderRadius: "16px", overflow: "hidden" }}>
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
                          <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "2px" }}>
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
