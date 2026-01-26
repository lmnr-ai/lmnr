"use client";

import { Loader2 } from "lucide-react";
import { type PropsWithChildren, useCallback, useEffect, useState } from "react";
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { v4 as uuidv4 } from "uuid";

import { getDefaultFilter, TriggerFiltersField } from "@/components/signals/trigger-filter-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type Filter } from "@/lib/actions/common/filters";
import { type Trigger } from "@/lib/actions/signal-triggers";
import { cn } from "@/lib/utils";

export type TriggerFormValues = {
  id?: string;
  filters: Filter[];
};

interface ManageTriggerDialogContentProps {
  setOpen: (open: boolean) => void;
  onSave: (trigger: Trigger) => Promise<void>;
  isNew?: boolean;
}

function ManageTriggerDialogContent({ setOpen, onSave, isNew }: ManageTriggerDialogContentProps) {
  const [isLoading, setIsLoading] = useState(false);
  const {
    handleSubmit,
    formState: { isValid },
  } = useFormContext<TriggerFormValues>();
  const filters = useWatch<TriggerFormValues, "filters">({ name: "filters" });

  const submit = useCallback(
    async (data: TriggerFormValues) => {
      try {
        setIsLoading(true);
        await onSave({
          id: data.id || uuidv4(),
          filters: data.filters,
        });
        setOpen(false);
      } finally {
        setIsLoading(false);
      }
    },
    [onSave, setOpen]
  );

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{isNew ? "Add Trigger" : "Edit Trigger"}</DialogTitle>
        <DialogDescription>
          Configure the filter conditions for this trigger. All filters are combined with AND (all must match).
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(submit)} className="grid gap-4">
        <TriggerFiltersField />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || !isValid || filters.length === 0} handleEnter>
            <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
            {isNew ? "Add" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

interface ManageTriggerDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  defaultValues?: Trigger;
  onSave: (trigger: Trigger) => Promise<void>;
}

export default function ManageTriggerDialog({
  children,
  open,
  setOpen,
  defaultValues,
  onSave,
}: PropsWithChildren<ManageTriggerDialogProps>) {
  const isNew = !defaultValues;

  const form = useForm<TriggerFormValues>({
    defaultValues: { filters: [getDefaultFilter()] },
    mode: "onChange",
  });

  useEffect(() => {
    if (open) {
      form.reset(
        defaultValues ? { id: defaultValues.id, filters: defaultValues.filters } : { filters: [getDefaultFilter()] }
      );
    }
  }, [open, defaultValues, form]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <FormProvider {...form}>
        <ManageTriggerDialogContent setOpen={setOpen} onSave={onSave} isNew={isNew} />
      </FormProvider>
    </Dialog>
  );
}

export { getColumnName, getOperatorLabel } from "@/components/signals/trigger-filter-field";
