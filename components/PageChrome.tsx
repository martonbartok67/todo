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
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar active={active} course={course} />

      {/* Main column */}
      <main className="flex-1 min-w-0">
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-28 md:pt-6 md:pb-8">

          {/* Mobile subject breadcrumb — only shown on subject pages */}
          {course && (
            <div className="md:hidden mb-4 flex items-center gap-2">
              <Link href="/" className="text-[11px] text-muted hover:text-foreground transition-colors">
                ← Tasks
              </Link>
              <span className="text-muted text-[11px]">/</span>
              <span className="text-[11px] font-medium truncate">{course.name}</span>
            </div>
          )}

          {/* Desktop theme toggle */}
          <div className="hidden md:flex justify-end mb-4">
            <ThemeToggle />
          </div>

          {children}
        </div>
      </main>

      {/* Mobile bottom tabs — full navigation lives here */}
      <BottomTabs active={active} />
    </div>
  );
}
