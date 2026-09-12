import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { Sidebar } from "./Sidebar";
import { BottomTabs } from "./BottomTabs";

export type PageId = "tasks" | "resources" | "readings" | "timetable" | "settings";

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
    <div
      className="min-h-screen flex"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar active={active} course={course} />

      {/* Main column */}
      <main className="flex-1 min-w-0">
        <div className="max-w-2xl mx-auto md:px-4 md:pt-6 md:pb-8">

          {/* Mobile subject breadcrumb — safe-area aware */}
          {course && (
            <div
              className="md:hidden px-4 pb-2 flex items-center gap-2"
              style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}
            >
              <Link
                href="/"
                className="tap-target"
                style={{ fontSize: "12px", color: "var(--muted)", padding: "4px 0" }}
              >
                ← Tasks
              </Link>
              <span style={{ fontSize: "12px", color: "var(--muted)" }}>/</span>
              <span style={{ fontSize: "12px", fontWeight: 600 }} className="truncate">
                {course.name}
              </span>
            </div>
          )}

          {/* Desktop theme toggle */}
          <div className="hidden md:flex justify-end mb-4">
            <ThemeToggle />
          </div>

          {/* Content — bottom padding clears the tab bar + home indicator */}
          <div
            className="px-4 md:px-0 md:pt-0 md:pb-0"
            style={{
              paddingTop: course ? "8px" : "0",
              paddingBottom: "calc(72px + env(safe-area-inset-bottom))",
            }}
          >
            {children}
          </div>
        </div>
      </main>

      <BottomTabs active={active} />
    </div>
  );
}
