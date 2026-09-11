import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { Sidebar } from "./Sidebar";
import { BottomTabs } from "./BottomTabs";

export type PageId = "tasks" | "resources" | "readings" | "timetable" | "settings";

const NAV: { id: PageId; label: string; href: string }[] = [
  { id: "tasks",     label: "Tasks",     href: "/" },
  { id: "readings",  label: "Readings",  href: "/readings" },
  { id: "timetable", label: "Schedule",  href: "/timetable" },
  { id: "resources", label: "Resources", href: "/resources" },
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
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-28 md:pt-6 md:pb-8">

          {/* Mobile header */}
          <header className="md:hidden flex items-center justify-between mb-5">
            <div className="flex items-center gap-1 bg-surface-1 border border-border rounded-xl p-1">
              {NAV.filter(n => n.id !== "settings").map((n) => {
                const isActive = n.id === active;
                return (
                  <Link
                    key={n.id}
                    href={n.href}
                    className={[
                      "px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                      isActive
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    {n.label}
                  </Link>
                );
              })}
            </div>
            <ThemeToggle />
          </header>

          {/* Mobile subject breadcrumb */}
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

      {/* Mobile bottom tabs */}
      <BottomTabs active={active} />
    </div>
  );
}
