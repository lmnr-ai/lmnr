import { type PropsWithChildren, useState } from "react";

import AddToLabelingQueueForm, {
  type AddToLabelingQueueFormProps,
} from "@/components/traces/add-to-labeling-queue-form";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface AddToLabelingQueuePopoverProps extends Omit<AddToLabelingQueueFormProps, "onAdded" | "submitInFooter"> {
  buttonVariant?: "default" | "secondary" | "outline" | "ghost" | "link" | "destructive";
  buttonSize?: "default" | "sm" | "lg" | "icon";
}

export default function AddToLabelingQueuePopover({
  buttonVariant = "secondary",
  buttonSize = "sm",
  children,
  ...formProps
}: PropsWithChildren<AddToLabelingQueuePopoverProps>) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {children || (
          <Button
            size={buttonSize}
            icon="pen"
            className={cn("w-fit", buttonVariant === "ghost" && "hover:bg-secondary")}
            variant={buttonVariant}
          >
            <span className="text-xs truncate block min-w-0">Add to labeling queue</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start" side="bottom">
        <div className="flex flex-col space-y-4">
          <span className="font-medium">Add to Queue</span>
          <AddToLabelingQueueForm {...formProps} onAdded={() => setOpen(false)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
