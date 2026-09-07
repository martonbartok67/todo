import { getInfoResources, type EnrichedResource } from "@/lib/tasks";
import { ResourcesDashboard } from "@/components/ResourcesDashboard";
import { PageChrome } from "@/components/PageChrome";

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  let items: EnrichedResource[] = [];
  try {
    items = await getInfoResources();
  } catch {}

  return (
    <PageChrome active="resources">
      <ResourcesDashboard items={items} />
    </PageChrome>
  );
}
