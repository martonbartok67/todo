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
      <TaskDashboard
        pending={pending}
        byCourse={byCourse}
        completed={completed}
        lastSync={lastSync ?? null}
      />
    </main>
  );
}
