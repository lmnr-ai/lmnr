"use client";

import AddToLabelingQueueForm, {
  type AddToLabelingQueueFormProps,
} from "@/components/traces/add-to-labeling-queue-form";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AddToLabelingQueueDialogProps extends Omit<AddToLabelingQueueFormProps, "onAdded" | "submitInFooter"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddToLabelingQueueDialog({ open, onOpenChange, ...formProps }: AddToLabelingQueueDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-96">
        <DialogHeader>
          <DialogTitle>Add to Queue</DialogTitle>
        </DialogHeader>
        <AddToLabelingQueueForm {...formProps} submitInFooter onAdded={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
