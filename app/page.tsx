import { getPendingTasks, getPendingTasksByCourse, getCompletedTasks, getLastSyncStatus } from "@/lib/tasks";
import TaskDashboard from "@/components/TaskDashboard";
import { PageChrome } from "@/components/PageChrome";
import type { EnrichedTask, CourseGroup } from "@/lib/tasks";
import type { SyncLog } from "@/drizzle/schema";

export const dynamic = "force-dynamic";

export default async function Home() {
  let pending:  EnrichedTask[]  = [];
  let byCourse: CourseGroup[]   = [];
  let completed: EnrichedTask[] = [];
  let lastSync: SyncLog | null  = null;

  try {
    [pending, byCourse, completed, lastSync] = await Promise.all([
      getPendingTasks(),
      getPendingTasksByCourse(),
      getCompletedTasks(),
      getLastSyncStatus(),
    ]);
  } catch (e) {
    // DB unavailable — render empty state, don't hang
    console.error("DEBUG Home() query failed:", e);
  }

  return (
    <PageChrome active="tasks">
      <TaskDashboard
        pending={pending}
        byCourse={byCourse}
        completed={completed}
        lastSync={lastSync}
      />
    </PageChrome>
  );
}
