/**
 * Home page — server component.
 * Fetches pending tasks and last sync status at request time (no client JS needed for initial render).
 * Task interactions (complete, snooze) use Server Actions.
 */
import { getPendingTasks, getUpcomingDeadlines, getLastSyncStatus } from "@/lib/tasks";
import { Suspense } from "react";

export const dynamic = "force-dynamic"; // always fresh — no stale cache

export default async function Home() {
  const [pending, upcoming, lastSync] = await Promise.all([
    getPendingTasks(),
    getUpcomingDeadlines(),
    getLastSyncStatus(),
  ]);

  const overdue   = pending.filter((t) => t.urgency === "critical");
  const dueToday  = pending.filter((t) => t.urgency === "high");
  const later     = pending.filter((t) => t.urgency !== "critical" && t.urgency !== "high");

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-6 max-w-2xl mx-auto">

      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
          {lastSync && (
            <p className="text-xs text-[#6b7280] mt-0.5">
              Synced {new Date(lastSync.startedAt).toLocaleString()} ·{" "}
              {lastSync.tasksUpserted} items
            </p>
          )}
        </div>
        {/* Notification bell placeholder — Step 4 */}
        <div className="relative">
          <button className="w-9 h-9 rounded-full bg-[#1a1a24] border border-[#2a2a3a] flex items-center justify-center text-sm">
            🔔
          </button>
          {upcoming.length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#ef4444] text-[10px] font-bold flex items-center justify-center">
              {upcoming.length}
            </span>
          )}
        </div>
      </header>

      {/* Empty state */}
      {pending.length === 0 && (
        <div className="text-center py-20 text-[#6b7280] text-sm">
          No pending tasks. Sync runs every 6 hours.
        </div>
      )}

      {/* Overdue / Critical */}
      {overdue.length > 0 && (
        <section className="mb-5">
          <p className="text-[11px] font-medium text-[#ef4444] uppercase tracking-widest mb-2">
            Overdue / Due within 24h
          </p>
          <TaskList tasks={overdue} />
        </section>
      )}

      {/* High — due within 48h */}
      {dueToday.length > 0 && (
        <section className="mb-5">
          <p className="text-[11px] font-medium text-[#f97316] uppercase tracking-widest mb-2">
            Due within 48h
          </p>
          <TaskList tasks={dueToday} />
        </section>
      )}

      {/* Later */}
      {later.length > 0 && (
        <section className="mb-5">
          <p className="text-[11px] font-medium text-[#6b7280] uppercase tracking-widest mb-2">
            Upcoming
          </p>
          <TaskList tasks={later} />
        </section>
      )}

    </main>
  );
}

// ── Inline server-safe TaskList (UI components with animations in Step 4) ──

import type { EnrichedTask } from "@/lib/tasks";
import { completeTask } from "@/app/actions/tasks";

const URGENCY_DOT: Record<string, string> = {
  critical: "bg-[#ef4444]",
  high:     "bg-[#f97316]",
  medium:   "bg-[#eab308]",
  low:      "bg-[#6366f1]",
  none:     "bg-[#374151]",
};

function TaskList({ tasks }: { tasks: EnrichedTask[] }) {
  return (
    <ul className="space-y-1.5">
      {tasks.map((task) => (
        <li
          key={task.id}
          className="flex items-start gap-3 rounded-xl bg-[#111118] border border-[#2a2a3a] px-3 py-2.5 group"
        >
          {/* Complete button */}
          <form action={completeTask.bind(null, task.id)} className="mt-0.5 shrink-0">
            <button
              type="submit"
              className="w-5 h-5 rounded-full border border-[#2a2a3a] group-hover:border-[#6366f1] transition-colors"
              aria-label="Mark complete"
            />
          </form>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug truncate">{task.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${URGENCY_DOT[task.urgency]}`}
              />
              <span className="text-[11px] text-[#6b7280] truncate">
                {task.courseName}
              </span>
              {task.dueAt && (
                <span className="text-[11px] text-[#6b7280] ml-auto shrink-0">
                  {new Date(task.dueAt).toLocaleDateString("en-NL", {
                    month: "short",
                    day:   "numeric",
                    hour:  "2-digit",
                    minute:"2-digit",
                  })}
                </span>
              )}
            </div>
          </div>

          {/* External link */}
          {task.url && (
            <a
              href={task.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[#6b7280] hover:text-white transition-colors mt-0.5 text-xs"
              aria-label="Open in Canvas"
            >
              ↗
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
