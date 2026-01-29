"use client";

import { get } from "lodash";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { type PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { Controller, FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";

import { getDefaultFilter, TriggerFiltersField } from "@/components/signals/trigger-filter-field";
import { type SchemaField } from "@/components/signals/utils";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type Filter } from "@/lib/actions/common/filters";
import { type Trigger } from "@/lib/actions/signal-triggers";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

export type TriggerFormValues = {
  id?: string;
  filters: Filter[];
  clusteringKey: string | null;
};

interface ManageTriggerDialogContentProps {
  setOpen: (open: boolean) => void;
  isNew?: boolean;
  schemaFields?: SchemaField[];
  signalId: string;
  onSuccess?: () => Promise<void>;
}

function ClusteringKeyField({ schemaFields }: { schemaFields: SchemaField[] }) {
  const { control, setValue } = useFormContext<TriggerFormValues>();
  const clusteringKey = useWatch<TriggerFormValues, "clusteringKey">({ name: "clusteringKey" });

  const stringFields = useMemo(
    () => schemaFields.filter((field) => field.type === "string" && field.name.trim()),
    [schemaFields]
  );

  const isEnabled = clusteringKey !== null && clusteringKey !== undefined;

  const handleToggle = useCallback(
    (checked: boolean) => {
      if (checked) {
        setValue("clusteringKey", stringFields[0]?.name ?? null);
      } else {
        setValue("clusteringKey", null);
      }
    },
    [setValue, stringFields]
  );

  if (stringFields.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-4">
        <Label htmlFor="clustering-toggle">Enable Clustering</Label>
        <Switch id="clustering-toggle" checked={isEnabled} onCheckedChange={handleToggle} />
      </div>
      {isEnabled && (
        <Controller
          name="clusteringKey"
          control={control}
          render={({ field }) => (
            <div className="flex flex-wrap gap-2">
              {stringFields.map((schemaField) => (
                <button
                  key={schemaField.name}
                  type="button"
                  onClick={() => field.onChange(schemaField.name)}
                  className={cn(
                    "px-2 py-1 text-sm rounded-md border transition-colors",
                    field.value === schemaField.name
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background hover:bg-muted border-input"
                  )}
                >
                  {schemaField.name}
                </button>
              ))}
            </div>
          )}
        />
      )}
    </div>
  );
}

function ManageTriggerDialogContent({
  setOpen,
  isNew,
  schemaFields,
  signalId,
  onSuccess,
}: ManageTriggerDialogContentProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { projectId } = useParams();
  const { toast } = useToast();

  const {
    handleSubmit,
    formState: { isValid },
  } = useFormContext<TriggerFormValues>();
  const filters = useWatch<TriggerFormValues, "filters">({ name: "filters" });

  const submit = useCallback(
    async (data: TriggerFormValues) => {
      try {
        setIsLoading(true);

        const isUpdate = !!data.id;
        const url = `/api/projects/${projectId}/signals/${signalId}/triggers`;
        const method = isUpdate ? "PUT" : "POST";

        const body = isUpdate
          ? { triggerId: data.id, filters: data.filters, clusteringKey: data.clusteringKey }
          : { filters: data.filters, clusteringKey: data.clusteringKey };

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const error = (await res.json()) as { error: string };
          toast({
            variant: "destructive",
            title: "Error",
            description: get(error, "error", `Failed to ${isUpdate ? "update" : "create"} the trigger`),
          });
          return;
        }

        if (onSuccess) {
          await onSuccess();
        }

        toast({ title: `Successfully ${isUpdate ? "updated" : "created"} trigger` });
        setOpen(false);
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            e instanceof Error
              ? e.message
              : `Failed to ${data.id ? "update" : "create"} the trigger. Please try again.`,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, signalId, toast, setOpen, onSuccess]
  );

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{isNew ? "Add Trigger" : "Edit Trigger"}</DialogTitle>
        <DialogDescription>Configure the filter conditions for this trigger.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit(submit)} className="grid gap-6">
        <TriggerFiltersField />
        {schemaFields && schemaFields.length > 0 && <ClusteringKeyField schemaFields={schemaFields} />}
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
  schemaFields?: SchemaField[];
  signalId: string;
  onSuccess?: () => Promise<void>;
}

export default function ManageTriggerDialog({
  children,
  open,
  setOpen,
  defaultValues,
  schemaFields,
  signalId,
  onSuccess,
}: PropsWithChildren<ManageTriggerDialogProps>) {
  const isNew = !defaultValues;

  const form = useForm<TriggerFormValues>({
    defaultValues: { filters: [getDefaultFilter()], clusteringKey: null },
    mode: "onChange",
  });

  useEffect(() => {
    if (open) {
      form.reset(
        defaultValues
          ? { id: defaultValues.id, filters: defaultValues.filters, clusteringKey: defaultValues.clusteringKey }
          : { filters: [getDefaultFilter()], clusteringKey: null }
      );
    }
  }, [open, defaultValues, form]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <FormProvider {...form}>
        <ManageTriggerDialogContent
          setOpen={setOpen}
          isNew={isNew}
          schemaFields={schemaFields}
          signalId={signalId}
          onSuccess={onSuccess}
        />
      </FormProvider>
    </Dialog>
  );
}

export { getColumnName, getOperatorLabel } from "@/components/signals/trigger-filter-field";
