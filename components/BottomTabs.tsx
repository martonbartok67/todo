"use client";
import Link from "next/link";
import type { ReactNode } from "react";

type Tab = { id: string; label: string; href: string; icon: ReactNode };

const TABS: Tab[] = [
  { id: "tasks",     label: "Tasks",    href: "/",          icon: <TasksIcon /> },
  { id: "readings",  label: "Readings", href: "/readings",  icon: <ReadingsIcon /> },
  { id: "timetable", label: "Schedule", href: "/timetable", icon: <TimetableIcon /> },
  { id: "resources", label: "Files",    href: "/resources", icon: <ResourcesIcon /> },
  { id: "settings",  label: "Settings", href: "/settings",  icon: <SettingsIcon /> },
];

export function BottomTabs({ active }: { active: string }) {
  return (
    <nav
      aria-label="Primary navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40"
      style={{
        background: "color-mix(in srgb, var(--background) 86%, transparent)",
        backdropFilter: "blur(22px) saturate(1.6)",
        WebkitBackdropFilter: "blur(22px) saturate(1.6)",
        borderTop: "1px solid var(--border)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul
        className="flex max-w-2xl mx-auto"
        style={{
          paddingLeft:  "max(4px, env(safe-area-inset-left))",
          paddingRight: "max(4px, env(safe-area-inset-right))",
          paddingTop:   "6px",
        }}
      >
        {TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <li key={t.id} className="flex-1">
              <Link
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className="relative flex flex-col items-center justify-center gap-[3px] w-full"
                style={{
                  color: isActive ? "var(--accent)" : "var(--muted)",
                  minHeight: "50px",
                  paddingBottom: "8px",
                  transition: "color var(--dur) var(--ease)",
                }}
              >
                {/* Active pill sits behind the icon rather than under the
                    label — keeps the target height honest at 44px+. */}
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: "-2px",
                    width: "40px",
                    height: "26px",
                    borderRadius: "999px",
                    background: isActive ? "var(--accent-soft)" : "transparent",
                    transition: "background var(--dur) var(--ease)",
                  }}
                />
                <span className="relative w-[21px] h-[21px]">{t.icon}</span>
                <span
                  className="relative"
                  style={{ fontSize: "10px", fontWeight: 800, lineHeight: 1, letterSpacing: "0.01em" }}
                >
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function TasksIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}
function ReadingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" />
      <path d="M4 17h14" />
    </svg>
  );
}
function TimetableIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18" />
    </svg>
  );
}
function ResourcesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
         strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
