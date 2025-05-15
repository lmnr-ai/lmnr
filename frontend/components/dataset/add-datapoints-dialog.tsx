import { File } from "lucide-react";
import React, { useState } from "react";

import { Badge } from "@/components/ui/badge";
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
        <Badge className="cursor-pointer py-1 px-2" variant="secondary">
          <File className="size-3 mr-2" />
          <span className="text-xs">Import file</span>
        </Badge>
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
  );
}
