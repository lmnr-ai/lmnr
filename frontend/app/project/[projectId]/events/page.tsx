import { redirect } from "next/navigation";

import { Feature, isFeatureEnabled } from "@/lib/features/features";

export default async function EventsPage(props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  if (isFeatureEnabled(Feature.SEMANTIC_EVENTS)) {
    redirect(`/project/${projectId}/events/semantic`);
  } else {
    redirect(`/project/${projectId}/events/code`);
  }
}
