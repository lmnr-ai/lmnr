"use client";

import ArchiveFolder from "./archive-folder";

interface ScriptsFilesProps {
  projectId: string;
  evaluationId: string;
  agent: string | null;
  gitSha: string | null;
}

/** The agent scripts (`evals/<agent>/` minus `task_sets/`) the evaluation's run used, as lmnr-cli uploaded them. */
export default function ScriptsFiles({ projectId, evaluationId, agent, gitSha }: ScriptsFilesProps) {
  const base = `/api/projects/${projectId}/evaluations/${evaluationId}/scripts`;
  const title = `${agent ?? "Agent"} scripts${gitSha ? ` @ ${gitSha.slice(0, 7)}` : ""}`;
  return (
    <ArchiveFolder
      id="evaluation-scripts"
      listUrl={base}
      contentUrl={(path) => `${base}/content?path=${encodeURIComponent(path)}`}
      root=""
      title={title}
      defaultFile="agent.yaml"
    />
  );
}
