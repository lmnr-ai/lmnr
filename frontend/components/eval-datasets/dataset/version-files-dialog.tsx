import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { shortHash } from "@/lib/actions/eval-datasets/types";

import VersionFiles from "./version-files";

interface VersionFilesDialogProps {
  projectId: string;
  datasetId: string;
  taskId: string;
  hash: string;
  onClose: () => void;
}

export default function VersionFilesDialog({ projectId, datasetId, taskId, hash, onClose }: VersionFilesDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[80vh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogTitle className="border-b px-4 py-3 text-sm font-medium">
          {taskId} <span className="font-mono text-xs text-muted-foreground">{shortHash(hash)}</span>
        </DialogTitle>
        <div className="flex min-h-0 flex-1">
          <VersionFiles projectId={projectId} datasetId={datasetId} taskId={taskId} hash={hash} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
