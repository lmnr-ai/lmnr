import { useMemo, useState } from "react";
import useSWR from "swr";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type EvalTaskVersion } from "@/lib/actions/eval-datasets/types";
import { swrFetcher } from "@/lib/api/fetch-api";
import { nameToPath } from "@/lib/evaluation/trial-files";

import { numberVersions } from "./rows";
import VersionFiles from "./version-files";
import VersionLabel from "./version-label";
import VersionsRail from "./versions-rail";

interface VersionFilesDialogProps {
  projectId: string;
  datasetId: string;
  taskId: string;
  /** The version to show; the newest when null. */
  hash: string | null;
  onSelectVersion: (hash: string) => void;
  onClose: () => void;
}

export default function VersionFilesDialog({
  projectId,
  datasetId,
  taskId,
  hash,
  onSelectVersion,
  onClose,
}: VersionFilesDialogProps) {
  // Lives above the versions so switching version keeps the same file open, when it has one.
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const { data } = useSWR<EvalTaskVersion[]>(
    `/api/projects/${projectId}/eval-datasets/${nameToPath(datasetId)}/tasks/${nameToPath(taskId)}/versions`,
    swrFetcher
  );
  const versions = useMemo(() => numberVersions(data ?? []), [data]);
  const selected = hash ?? versions[0]?.hash;
  const version = versions.find((v) => v.hash === selected);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[80vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="flex items-center gap-3 border-b px-4 py-3 text-sm font-medium">
          {taskId}
          {version && <VersionLabel version={version} />}
        </DialogTitle>
        <div className="flex min-h-0 flex-1">
          <VersionsRail versions={versions} selected={selected} onSelect={onSelectVersion} />
          <div className="flex min-w-0 flex-1">
            {selected && (
              <VersionFiles
                projectId={projectId}
                datasetId={datasetId}
                taskId={taskId}
                hash={selected}
                selectedPath={selectedPath}
                onSelectPath={setSelectedPath}
              />
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
