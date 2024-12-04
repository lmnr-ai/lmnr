import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../ui/dialog';
import { Label } from '../ui/label';

export interface DeleteDatapointsDialogProps {
  selectedDatapointIds: string[];
  onDelete: (s: string[], useAll: boolean) => Promise<void>;
  totalDatapointsCount: number;
  useAll: boolean;
}

export default function DeleteDatapointsDialog({
  selectedDatapointIds,
  onDelete,
  useAll,
  totalDatapointsCount
}: DeleteDatapointsDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const count = useAll ? totalDatapointsCount : selectedDatapointIds.length;
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) {
          setIsLoading(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={selectedDatapointIds.length === 0 && !useAll}
          onClick={() => setOpen(true)}
        >
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Datapoints</DialogTitle>
        </DialogHeader>
        <Label>
          Are you sure you want to delete {count} datapoint
          {count === 1 ? '' : 's'}?
        </Label>
        <DialogFooter>
          <Button
            disabled={isLoading}
            onClick={async () => {
              setIsLoading(true);
              await onDelete(selectedDatapointIds, useAll);
              setIsLoading(false);
              setOpen(false);
            }}
          >
            {isLoading && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
