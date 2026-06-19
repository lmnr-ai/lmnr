"use client";

import { Loader2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import SignalFormFields from "./signal-form-fields";
import { type ManageSignalForm } from "./types";
import useSubmitHandler from "./use-submit-handler";

export type ManageSignalContentVariant = "sheet" | "panel";

interface ManageSignalContentProps {
  variant: ManageSignalContentVariant;
  onClose?: () => void;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
  onSubmitComplete: (data: ManageSignalForm) => void;
  previousTriggerIds: string[];
  className?: string;
  scrollAreaClassName?: string;
}

export default function ManageSignalContent({
  variant,
  onClose,
  onSuccess,
  onSubmitComplete,
  previousTriggerIds,
  className,
  scrollAreaClassName,
}: ManageSignalContentProps) {
  const [isLoading, setIsLoading] = useState(false);

  const { projectId } = useParams();
  const { toast } = useToast();
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { isValid, isDirty },
  } = useFormContext<ManageSignalForm>();
  const id = watch("id");

  const setFormId = (newId: string) => setValue("id", newId);
  const setFormTriggers = (triggers: ManageSignalForm["triggers"]) => setValue("triggers", triggers);

  const submit = useSubmitHandler({
    projectId: String(projectId),
    toast,
    onSubmitComplete,
    onSuccess,
    setIsLoading,
    previousTriggerIds,
    setFormId,
    setFormTriggers,
  });

  return (
    <form onSubmit={handleSubmit(submit)} className={cn("flex flex-col flex-1 overflow-hidden min-w-0", className)}>
      {variant === "sheet" && (
        <div className="flex items-center justify-between px-5 pt-3">
          <SheetTitle className="text-base">{id ? "Edit Signal" : "Create Signal"}</SheetTitle>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
      <ScrollArea className={cn("flex-1 px-5 flex flex-col items-center w-full")}>
        <SignalFormFields
          variant={variant}
          isLoading={isLoading}
          showTemplates={!id}
          className={cn("", scrollAreaClassName)}
        />
      </ScrollArea>
      {(variant === "sheet" || !id) && (
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t">
          <Button className="ml-auto w-fit gap-2" type="submit" size="md" disabled={isLoading || !isValid || !isDirty}>
            <Loader2 className={cn("hidden", isLoading && "animate-spin block")} size={16} />
            {id ? "Save" : "Create"}
          </Button>
        </div>
      )}
    </form>
  );
}
