import Link from "next/link";

import { type TaskInfo } from "@/lib/actions/task-sets/types";

interface TaskMetadataProps {
  projectId: string;
  task: TaskInfo;
}

const display = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

/** The task's `[metadata]` from task.toml; `trace_ids` (tasks built from traces) link to those traces. */
export default function TaskMetadata({ projectId, task }: TaskMetadataProps) {
  const entries = Object.entries(task.metadata ?? {});
  const traceIds = Array.isArray(task.metadata?.trace_ids)
    ? task.metadata.trace_ids.filter((id): id is string => typeof id === "string")
    : [];

  return (
    <div className="flex flex-none flex-col gap-1 border-b px-3 py-2 text-xs">
      <div className="font-mono text-secondary-foreground" title="Task digest">
        {task.digest.slice(0, 12)}
      </div>
      {entries
        .filter(([key]) => key !== "trace_ids")
        .map(([key, value]) => (
          <div key={key} className="flex gap-2">
            <span className="text-secondary-foreground">{key}</span>
            <span className="truncate font-mono">{display(value)}</span>
          </div>
        ))}
      {traceIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <span className="text-secondary-foreground">source traces</span>
          {traceIds.map((id) => (
            <Link
              key={id}
              href={`/project/${projectId}/traces?traceId=${encodeURIComponent(id)}`}
              className="font-mono text-primary-text hover:underline"
            >
              {id.slice(0, 8)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
