import Message from "@/components/evaluation/task-files/message";
import TraceView from "@/components/traces/trace-view";
import { type EvalRow } from "@/lib/evaluation/types";

/** The trial's full trace view; its span panel opens on a span click and can be closed. */
export default function TrialTrace({ trial }: { trial: EvalRow }) {
  const traceId = trial["traceId"] as string | undefined;
  return traceId ? (
    <TraceView key={traceId} traceId={traceId} urlState />
  ) : (
    <Message>This trial has no trace yet.</Message>
  );
}
