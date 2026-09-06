import { getPendingTasks, getCompletedTasks, getLastSyncStatus } from "@/lib/tasks";
import TaskDashboard from "@/components/TaskDashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [pending, completed, lastSync] = await Promise.all([
    getPendingTasks(),
    getCompletedTasks(),
    getLastSyncStatus(),
  ]);

  return (
    <main className="min-h-screen bg-[#0a0a0f] px-4 py-6 max-w-2xl mx-auto">
      <TaskDashboard
        pending={pending}
        completed={completed}
        lastSync={lastSync ?? null}
      />
    </main>
  );
}
