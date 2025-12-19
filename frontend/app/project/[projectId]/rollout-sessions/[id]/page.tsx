import { notFound } from "next/navigation";

import RolloutSession from "@/components/rollout-sessions";
import { getRolloutSession } from "@/lib/actions/rollout-sessions";
import { getTrace } from "@/lib/actions/trace";

export default async function RolloutSessionPage(props: { params: Promise<{ projectId: string; id: string }> }) {
  const { projectId, id } = await props.params;

  const session = await getRolloutSession({ projectId, id });
  if (!session) return notFound();

  const trace = await getTrace({ projectId, traceId: session.traceId });

  if (!trace) return notFound();

  return <RolloutSession sessionId={session.id} trace={{ ...trace, endTime: session.cursorTimestamp }} />;
}
