"use client";

import ArchiveFolder from "./archive-folder";
import Message from "./message";

interface TaskFilesProps {
  projectId: string;
  evaluationId: string;
  /** The trial's task dir in the evaluation's task set; null when it isn't in it. */
  taskPath: string | null;
  /** Shown above the tree; the dir's last segment when the trial has none. */
  taskName: string | null;
}

/** The trial's task folder from the task set its evaluation ran. Mount with `key={taskPath}`. */
export default function TaskFiles({ projectId, evaluationId, taskPath, taskName }: TaskFilesProps) {
  if (!taskPath) {
    return <Message>This trial&apos;s task isn&apos;t in the task set, so its files can&apos;t be shown.</Message>;
  }
  const base = `/api/projects/${projectId}/evaluations/${evaluationId}/files`;
  return (
    <ArchiveFolder
      id="evaluation-task-files"
      listUrl={base}
      contentUrl={(path) => `${base}/content?path=${encodeURIComponent(path)}`}
      root={taskPath}
      title={taskName ?? taskPath.split("/").pop() ?? taskPath}
    />
  );
}
