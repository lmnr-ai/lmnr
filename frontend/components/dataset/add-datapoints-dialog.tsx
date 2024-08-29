import React, { useState } from 'react';

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import DatasetUpload from './dataset-upload';


interface AddDatapointsDialogProps {
  datasetId: string;
  onUpdate?: () => void;
}

export default function AddDatapointsDialog({ datasetId, onUpdate }: AddDatapointsDialogProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
        >
          Add from source
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add datapoints from source</DialogTitle>
        </DialogHeader>
        <DatasetUpload
          datasetId={datasetId}
          onSuccessfulUpload={() => {
            setIsDialogOpen(false);
            onUpdate?.();
          }}
        />
      </DialogContent>
    </Dialog>
  )
}