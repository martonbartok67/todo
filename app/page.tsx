import { getPendingTasks, getPendingTasksByCourse, getCompletedTasks, getLastSyncStatus } from "@/lib/tasks";
import { dbReady } from "@/lib/db";
import TaskDashboard from "@/components/TaskDashboard";
import { PageChrome } from "@/components/PageChrome";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Make sure schema is bootstrapped (new columns + indexes applied) before
  // any read query. Without this, the very first request after a deploy
  // races with the background ensureSchema() and hits "no such column".
  await dbReady();
  const [pending, byCourse, completed, lastSync] = await Promise.all([
    getPendingTasks(),
    getPendingTasksByCourse(),
    getCompletedTasks(),
    getLastSyncStatus(),
  ]);

  return (
    <PageChrome active="tasks">
      <TaskDashboard
        pending={pending}
        byCourse={byCourse}
        completed={completed}
        lastSync={lastSync ?? null}
      />
    </PageChrome>
  );
}
