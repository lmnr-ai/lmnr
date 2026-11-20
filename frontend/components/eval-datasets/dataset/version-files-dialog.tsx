import { X } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type EvalTaskVersion } from "@/lib/actions/eval-datasets/types";
import { swrFetcher } from "@/lib/api/fetch-api";
import { nameToPath } from "@/lib/evaluation/trial-files";

import { numberVersions } from "./rows";
import VersionFiles from "./version-files";
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
        <div className="flex items-center justify-between gap-3 border-b py-2 pl-4 pr-2">
          <DialogTitle className="min-w-0 truncate text-sm font-medium">{taskId}</DialogTitle>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Close">
              <X className="size-4" />
            </Button>
          </DialogClose>
        </div>
        <div className="flex min-h-0 flex-1">
          <VersionsRail versions={versions} selected={selected} onSelect={onSelectVersion} />
          <div className="flex min-w-0 flex-1">
            {version && (
              <VersionFiles
                projectId={projectId}
                datasetId={datasetId}
                taskId={taskId}
                version={version}
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
