import React, { useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

import DatasetUpload from "./dataset-upload";

interface AddDatapointsDialogProps {
  datasetId: string;
  onUpdate?: () => void;
}

export default function AddDatapointsDialog({ datasetId, onUpdate }: AddDatapointsDialogProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button icon="file" variant="secondary">
          Import file
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-96">
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
  );
}
