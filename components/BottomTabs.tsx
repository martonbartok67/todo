"use client";

/**
 * 📱 BottomTabs — fixed tab bar at the bottom of the screen on mobile.
 *
 * Hidden on md+ (where the sidebar takes over). Uses the same icon set as
 * the sidebar so the visual language matches.
 *
 * We render it as a separate component (instead of inside PageChrome) so
 * that future layouts (e.g. a dedicated settings page that doesn't want
 * the tabs) can opt out by simply not including it.
 */
import Link from "next/link";
import type { ReactNode } from "react";

type Tab = {
  id: string;
  label: string;
  href: string;
  icon: ReactNode;
};

const TABS: Tab[] = [
  { id: "tasks",     label: "Tasks",     href: "/",          icon: <TasksIcon /> },
  { id: "resources", label: "Resources", href: "/resources", icon: <ResourcesIcon /> },
  { id: "readings",  label: "Readings",  href: "/readings",  icon: <ReadingsIcon /> },
  { id: "timetable", label: "Timetable", href: "/timetable", icon: <TimetableIcon /> },
];

export function BottomTabs({ active }: { active: string }) {
  // Note: 4 tabs (no Settings on mobile — the user can reach it from the
  // sidebar if they log in on desktop). This keeps the mobile bar thumb-friendly.
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur border-t border-border"
    >
      <ul className="grid grid-cols-4 max-w-2xl mx-auto">
        {TABS.map((t) => {
          const isActive = t.id === active;
          return (
            <li key={t.id}>
              <Link
                href={t.href}
                aria-current={isActive ? "page" : undefined}
                className={[
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted hover:text-foreground/70",
                ].join(" ")}
              >
                <span className={["w-5 h-5", isActive ? "text-foreground" : ""].join(" ")}>{t.icon}</span>
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Safe area for iPhones with home indicators */}
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
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
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
