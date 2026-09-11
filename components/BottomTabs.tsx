"use client";
import Link from "next/link";
import type { ReactNode } from "react";

type Tab = { id: string; label: string; href: string; icon: ReactNode };

const TABS: Tab[] = [
  { id: "tasks",     label: "Tasks",    href: "/",          icon: <TasksIcon /> },
  { id: "readings",  label: "Readings", href: "/readings",  icon: <ReadingsIcon /> },
  { id: "timetable", label: "Schedule", href: "/timetable", icon: <TimetableIcon /> },
  { id: "resources", label: "Resources",href: "/resources", icon: <ResourcesIcon /> },
  { id: "settings",  label: "",         href: "/settings",  icon: <SettingsIcon /> },
];

export function BottomTabs({ active }: { active: string }) {
  return (
    <nav
      aria-label="Primary navigation"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-md border-t border-border"
    >
      <ul className="flex max-w-2xl mx-auto">
        {/* Main tabs — equal width, fill available space */}
        {TABS.slice(0, 4).map((t) => {
          const isActive = t.id === active;
          return (
            <li key={t.id} className="flex-1">
              <Link
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex flex-col items-center justify-center gap-1 py-3 w-full text-[10px] font-medium transition-colors relative",
                  isActive ? "text-foreground" : "text-muted hover:text-foreground/70",
                ].join(" ")}
              >
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[2px] bg-foreground rounded-full" />
                )}
                <span className="w-[22px] h-[22px]">{t.icon}</span>
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}

        {/* Settings — small gear icon, no label, fixed narrow width */}
        {(() => {
          const t = TABS[4];
          const isActive = t.id === active;
          return (
            <li className="w-10 flex items-center justify-center">
              <Link
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                aria-label="Settings"
                className={[
                  "flex items-center justify-center w-8 h-8 rounded-lg transition-colors relative",
                  isActive
                    ? "text-foreground bg-surface-2"
                    : "text-muted hover:text-foreground",
                ].join(" ")}
              >
                <span className="w-[17px] h-[17px]">{t.icon}</span>
              </Link>
            </li>
          );
        })()}
      </ul>
      <div className="h-[env(safe-area-inset-bottom)]" />
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
