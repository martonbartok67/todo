import { getInfoResources, type EnrichedResource } from "@/lib/tasks";
import { dbReady } from "@/lib/db";
import { ResourcesDashboard } from "@/components/ResourcesDashboard";
import { PageChrome } from "@/components/PageChrome";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  // Make sure schema is bootstrapped (new columns + indexes applied) before
  // any read query. Without this, the very first request after a deploy
  // races with the background ensureSchema() and hits "no such column".
  await dbReady();
  let items: EnrichedResource[] = [];
  try {
    items = await getInfoResources();
  } catch {
    // Table not yet migrated — the page will render an empty state.
  }

  return (
    <PageChrome active="resources">
      <ResourcesDashboard items={items} />
    </PageChrome>
  );
}