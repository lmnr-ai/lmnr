import { type CellContext } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import VersionFilesDialog from "@/components/eval-datasets/dataset/version-files-dialog";
import { datasetTaskOf } from "@/components/evaluation/trial-files/utils";
import { LinkChip } from "@/components/traces/trace-view/span-reference";
import CopyTooltip from "@/components/ui/copy-tooltip";
import { type EvaluationTaskVersions } from "@/lib/actions/evaluation/task-versions";
import { swrFetcher } from "@/lib/api/fetch-api";
import { type EvalRow } from "@/lib/evaluation/types";

interface PushedTaskVersion {
  projectId: string;
  dataset: string;
  task: string;
  hash: string;
}

/** The first of the task's trials whose task version was pushed; null when none was. */
const usePushedTaskVersion = (row: EvalRow): PushedTaskVersion | null => {
  const { projectId, evaluationId } = useParams<{ projectId?: string; evaluationId?: string }>();
  // One request per evaluation: every cell shares the SWR key.
  const { data } = useSWR<EvaluationTaskVersions>(
    projectId && evaluationId ? `/api/projects/${projectId}/evaluations/${evaluationId}/task-versions` : null,
    swrFetcher,
    { revalidateOnFocus: false }
  );
  if (!projectId || !data?.dataset) return null;

  const pushed = new Set(data.versions.map((v) => `${v.task}\n${v.hash}`));
  // A Task with one Trial stays a plain row (no `subRows`): the row is the Trial.
  const trials = (row["subRows"] as EvalRow[] | undefined) ?? [row];
  for (const trial of trials) {
    const task = datasetTaskOf(trial);
    const hash = trial["taskVersionHash"];
    if (task && typeof hash === "string" && pushed.has(`${task}\n${hash}`)) {
      return { projectId, dataset: data.dataset, task, hash };
    }
  }
  return null;
};

/** The task as a chip that opens its version's files in place. */
const TaskVersionChip = ({ name, version }: { name: string; version: PushedTaskVersion }) => {
  const [hash, setHash] = useState<string | null>(null);
  return (
    <>
      {/* No vertical padding, so the chip is as tall as plain text and the row keeps its height. */}
      <LinkChip name={name} className="py-0" onClick={() => setHash(version.hash)} />
      {hash && (
        // The dialog portals out of the row in the DOM but not in React, so its clicks would reach the row.
        <div className="contents" onClick={(e) => e.stopPropagation()}>
          <VersionFilesDialog
            projectId={version.projectId}
            datasetId={version.dataset}
            taskId={version.task}
            hash={hash}
            onSelectVersion={setHash}
            onClose={() => setHash(null)}
          />
        </div>
      )}
    </>
  );
};

export const TaskCell = ({ row, getValue }: CellContext<EvalRow, unknown>) => {
  const version = usePushedTaskVersion(row.original);

  if (row.depth > 0) {
    const trialId = String(row.original["id"]);
    return (
      <CopyTooltip
        value={trialId}
        text="Copy Trial id"
        className="block truncate pl-3 font-mono text-secondary-foreground"
      >
        {trialId}
      </CopyTooltip>
    );
  }

  const taskId = String(getValue() ?? "");
  if (version && taskId.trim()) return <TaskVersionChip name={taskId} version={version} />;
  return taskId.trim() ? (
    <span className="truncate" title={taskId}>
      {taskId}
    </span>
  ) : (
    // Whitespace-only ids are distinct Tasks; quote them so they don't render blank.
    <span className="truncate whitespace-pre text-muted-foreground">{JSON.stringify(taskId)}</span>
  );
};
