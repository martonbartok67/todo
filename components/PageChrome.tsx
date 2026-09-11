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
    <div className="min-h-screen flex" style={{ background: "var(--background)", color: "var(--foreground)" }}>
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar active={active} course={course} />

      {/* Main column */}
      <main className="flex-1 min-w-0">
        <div className="max-w-2xl mx-auto md:px-4 md:pt-6 md:pb-8">

          {/* Mobile subject breadcrumb — only shown on subject pages */}
          {course && (
            <div className="md:hidden px-4 pt-16 pb-2 flex items-center gap-2">
              <Link href="/" className="text-[11px]" style={{ color: "var(--muted)" }}>
                ← Tasks
              </Link>
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>/</span>
              <span className="text-[11px] font-medium truncate">{course.name}</span>
            </div>
          )}

          {/* Desktop theme toggle */}
          <div className="hidden md:flex justify-end mb-4">
            <ThemeToggle />
          </div>

          <div className="px-4 pt-4 pb-[88px] md:px-0 md:pt-0 md:pb-0">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile bottom tabs — full navigation lives here */}
      <BottomTabs active={active} />
    </div>
  );
}
