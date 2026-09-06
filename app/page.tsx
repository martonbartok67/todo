import { getPendingTasks, getPendingTasksByCourse, getCompletedTasks, getLastSyncStatus } from "@/lib/tasks";
import TaskDashboard from "@/components/TaskDashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [pending, byCourse, completed, lastSync] = await Promise.all([
    getPendingTasks(),
    getPendingTasksByCourse(),
    getCompletedTasks(),
    getLastSyncStatus(),
  ]);

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-6 max-w-2xl mx-auto">
      {/* Nav */}
      <nav className="flex gap-2 mb-6">
        <span className="text-[11px] font-medium text-white border-b border-[#6366f1] pb-0.5">Tasks</span>
        <a href="/readings" className="text-[11px] text-[#6b7280] hover:text-white transition-colors pb-0.5">
          Readings
        </a>
      </nav>
      <TaskDashboard
        pending={pending}
        byCourse={byCourse}
        completed={completed}
        lastSync={lastSync ?? null}
      />
    </main>
  );
}
