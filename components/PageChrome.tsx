import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { Sidebar } from "./Sidebar";
import { BottomTabs } from "./BottomTabs";

/**
 * 📐 Page chrome — the layout shell every page renders into.
 *
 * Layout strategy:
 *   • md+ (≥768px) → left sidebar + content column
 *   • <md          → top header strip + content column + fixed bottom tab bar
 *
 * Active tab is one of: "tasks" | "readings" | "timetable" | "settings".
 * `course` is set when the user is inside `/subjects/[course_id]` — it
 * makes the sidebar show a "you're inside Marketing" context card.
 *
 * The page-content max-width (2xl) is preserved so the design stays
 * focused even with a sidebar present.
 */
export type PageId = "tasks" | "resources" | "readings" | "timetable" | "settings";

const NAV: { id: PageId; label: string; href: string }[] = [
  { id: "tasks",     label: "Tasks",     href: "/" },
  { id: "resources", label: "Resources", href: "/resources" },
  { id: "readings",  label: "Readings",  href: "/readings" },
  { id: "timetable", label: "Timetable", href: "/timetable" },
  { id: "settings",  label: "Settings",  href: "/settings" },
];

export function PageChrome({
  active,
  course,
  children,
}: {
  active: PageId;
  course?: { id: string; name: string };
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Desktop sidebar */}
      <Sidebar active={active} course={course} />

      {/* Main column */}
      <main className="flex-1 min-w-0">
        <div className="max-w-2xl mx-auto px-4 py-6 pb-24 md:pb-6">
          {/* Mobile + tablet top header — hidden on md+ where the sidebar lives */}
          <header className="md:hidden flex items-center justify-between gap-4 mb-6">
            <nav className="flex items-center gap-1">
              {NAV.map((n) => {
                const isActive = n.id === active;
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    className={[
                      "px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors",
                      isActive
                        ? "bg-foreground text-background"
                        : "text-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </nav>
            <ThemeToggle />
          </header>

          {/* Mobile subject context (mirrors what the sidebar shows on md+) */}
          {course && (
            <div className="md:hidden mb-4 px-3 py-2.5 rounded-lg bg-surface-1 border border-border">
              <p className="text-[10px] uppercase tracking-widest text-muted font-medium">
                Subject
              </p>
              <p className="text-[14px] font-medium mt-0.5 truncate">{course.name}</p>
              <Link
                href="/"
                className="text-[11px] text-muted hover:text-foreground mt-1 inline-block transition-colors"
              >
                ← Back to all subjects
              </Link>
            </div>
          )}

          {/* Theme toggle pinned to the right of the desktop header.
           * We render it here (outside the sidebar) so it stays clickable
           * even when the sidebar scrolls. */}
          <div className="hidden md:flex justify-end mb-4">
            <ThemeToggle />
          </div>

          {children}
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <BottomTabs active={active} />
    </div>
  );
}
