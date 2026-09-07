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
  { id: "timetable", label: "Timetable", href: "/timetable", icon: <ClockIcon /> },
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
    <aside className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r border-border bg-background h-screen sticky top-0 px-4 py-6">
      {/* App title */}
      <div className="px-2 pb-4 mb-2 border-b border-border">
        <p className="text-[15px] font-semibold tracking-tight">Canvas Sync</p>
        <p className="text-[11px] text-muted mt-0.5">Task tracker</p>
      </div>

      {MAIN_NAV.map((item) => {
        const isActive = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={[
              "relative flex items-center gap-2.5 pl-4 pr-3 py-2 rounded-lg text-[13px] transition-colors",
              isActive
                ? "bg-surface-1 text-foreground font-medium"
                : "text-muted hover:text-foreground hover:bg-surface-1",
            ].join(" ")}
          >
            {/* Left accent strip — only visible on the active item. */}
            {isActive && (
              <span
                aria-hidden
                className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-foreground"
              />
            )}
            <span className="w-4 h-4 shrink-0">{item.icon}</span>
            <span className="flex-1 truncate">{item.label}</span>
          </Link>
        );
      })}

      {/* Course context — only rendered when inside /subjects/[id] */}
      {course && (
        <div className="mt-6 px-3 py-3 rounded-lg bg-surface-1 border border-border">
          <p className="text-[10px] uppercase tracking-widest text-muted font-medium">
            Subject
          </p>
          <p className="text-[13px] font-medium mt-1 truncate">{course.name}</p>
          <Link
            href="/"
            className="text-[11px] text-muted hover:text-foreground mt-2 inline-block transition-colors"
          >
            ← Back to all subjects
          </Link>
        </div>
      )}

      {/* Spacer + theme toggle pinned at the bottom */}
      <div className="mt-auto pt-4 border-t border-border">
        {/* ThemeToggle is rendered here by PageChrome in a wrapper below */}
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
