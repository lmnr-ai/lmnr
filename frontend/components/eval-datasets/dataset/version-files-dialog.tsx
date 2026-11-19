import { useState } from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { type TaskVersion } from "./rows";
import VersionFiles from "./version-files";
import VersionLabel from "./version-label";
import VersionsRail from "./versions-rail";

interface VersionFilesDialogProps {
  projectId: string;
  datasetId: string;
  taskId: string;
  hash: string;
  /** The task's versions, newest first. */
  versions: TaskVersion[];
  onSelectVersion: (hash: string) => void;
  onClose: () => void;
}

export default function VersionFilesDialog({
  projectId,
  datasetId,
  taskId,
  hash,
  versions,
  onSelectVersion,
  onClose,
}: VersionFilesDialogProps) {
  // Lives above the versions so switching version keeps the same file open, when it has one.
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const version = versions.find((v) => v.hash === hash);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[80vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="flex items-center gap-3 border-b px-4 py-3 text-sm font-medium">
          {taskId}
          {version && <VersionLabel version={version} isLatest={version.hash === versions[0]?.hash} />}
        </DialogTitle>
        <div className="flex min-h-0 flex-1">
          <VersionsRail versions={versions} selected={hash} onSelect={onSelectVersion} />
          <div className="flex min-w-0 flex-1">
            <VersionFiles
              projectId={projectId}
              datasetId={datasetId}
              taskId={taskId}
              hash={hash}
              selectedPath={selectedPath}
              onSelectPath={setSelectedPath}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
