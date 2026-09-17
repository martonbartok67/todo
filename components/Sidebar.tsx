"use client";

/**
 * 🗂️ Sidebar — the vertical nav on the LEFT, visible on md+ screens.
 *
 * Each item is a row with an icon, a label, and an active-state pill.
 * Below the main nav we render an optional `course` block — used on
 * `/subjects/[course_id]` to show context ("you're inside Marketing").
 *
 * The component is purely presentational: it doesn't fetch data, doesn't
 * own state. Active state is computed from the `active` prop passed in.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
};

const MAIN_NAV: NavItem[] = [
  { id: "tasks",     label: "Tasks",     href: "/",          icon: <SquareIcon /> },
  { id: "resources", label: "Resources", href: "/resources", icon: <FolderIcon /> },
  { id: "readings",  label: "Readings",  href: "/readings",  icon: <BookIcon /> },
  { id: "timetable", label: "Schedule", href: "/timetable", icon: <ClockIcon /> },
  { id: "settings",  label: "Settings",  href: "/settings",  icon: <GearIcon /> },
];

export function Sidebar({
  active,
  course,
}: {
  active: string;
  course?: { id: string; name: string };
}) {
  return (
    <aside
      className="hidden md:flex w-60 shrink-0 flex-col gap-1 h-screen sticky top-0 px-3 py-6"
      style={{
        background: "var(--background-alt)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* Wordmark */}
      <div className="px-3 pb-5 mb-2" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            style={{
              width: "28px", height: "28px", borderRadius: "9px",
              background: "var(--accent-gradient)", color: "var(--accent-fg)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "14px", fontWeight: 900, flexShrink: 0,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            ✓
          </span>
          <span className="min-w-0">
            <span style={{
              display: "block", fontSize: "14px", fontWeight: 800,
              letterSpacing: "-0.02em", color: "var(--foreground)",
            }}>
              Canvas Sync
            </span>
            <span style={{ display: "block", fontSize: "11px", color: "var(--muted)" }}>
              Task tracker
            </span>
          </span>
        </div>
      </div>

      {MAIN_NAV.map((item) => {
        const isActive = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className="relative flex items-center gap-2.5 px-3 py-2 text-[13px]"
            style={{
              borderRadius: "var(--r-md)",
              fontWeight: isActive ? 800 : 600,
              color: isActive ? "var(--accent)" : "var(--muted)",
              background: isActive ? "var(--accent-soft)" : "transparent",
              transition: "background var(--dur) var(--ease), color var(--dur) var(--ease)",
            }}
          >
            <span className="w-[17px] h-[17px] shrink-0">{item.icon}</span>
            <span className="flex-1 truncate">{item.label}</span>
            {isActive && (
              <span aria-hidden style={{
                width: "5px", height: "5px", borderRadius: "50%", background: "var(--accent)",
              }} />
            )}
          </Link>
        );
      })}

      {/* Course context — only rendered when inside /subjects/[id] */}
      {course && (
        <div
          className="mt-6 px-3 py-3"
          style={{
            borderRadius: "var(--r-md)",
            background: "var(--surface-card)",
            border: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <p className="section-label">Subject</p>
          <p className="text-[13px] font-bold mt-1.5 truncate">{course.name}</p>
          <Link
            href="/"
            className="text-[11px] mt-2 inline-block transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)", fontWeight: 700 }}
          >
            ← All subjects
          </Link>
        </div>
      )}

      <div className="mt-auto pt-4" style={{ borderTop: "1px solid var(--border)" }}>
        {/* ThemeToggle is rendered by PageChrome */}
        <div id="sidebar-theme-slot" />
      </div>
    </aside>
  );
}

// ── icons (1.5px stroke, 16×16) ────────────────────────────────────────────

function SquareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" />
      <path d="M4 17h14" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
