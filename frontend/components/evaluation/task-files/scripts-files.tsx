"use client";

import ArchiveFolder from "./archive-folder";

interface ScriptsFilesProps {
  projectId: string;
  evaluationId: string;
  taskSet: string | null;
  gitSha: string | null;
}

/** The scripts the evaluation's run used: lmnr-cli uploads the whole evals folder minus every task set's `tasks/`. */
export default function ScriptsFiles({ projectId, evaluationId, taskSet, gitSha }: ScriptsFilesProps) {
  const base = `/api/projects/${projectId}/evaluations/${evaluationId}/scripts`;
  const title = `Scripts${gitSha ? ` @ ${gitSha.slice(0, 7)}` : ""}`;
  return (
    <ArchiveFolder
      id="evaluation-scripts"
      listUrl={base}
      contentUrl={(path) => `${base}/content?path=${encodeURIComponent(path)}`}
      root=""
      title={title}
      defaultFile={taskSet ? `${taskSet}/eval.yaml` : undefined}
    />
  );
}
