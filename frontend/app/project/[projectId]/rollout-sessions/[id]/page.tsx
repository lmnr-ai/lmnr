import { notFound } from "next/navigation";

import RolloutSession from "@/components/rollout-sessions";
import { getLatestTraceBySessionId, getRolloutSession, RolloutSessionStatus } from "@/lib/actions/rollout-sessions";

export default async function RolloutSessionPage(props: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await props.params;

  const session = await getRolloutSession({ projectId, id });
  if (!session) return notFound();

  const trace = await getLatestTraceBySessionId({ projectId, sessionId: id });

  return (
    <RolloutSession
      projectId={projectId}
      params={session.params as Array<any>}
      sessionId={session.id}
      trace={trace}
      initialStatus={session.status as RolloutSessionStatus}
    />
  );
}
