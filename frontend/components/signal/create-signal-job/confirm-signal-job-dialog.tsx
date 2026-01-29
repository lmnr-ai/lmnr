"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";

import { type SchemaField } from "@/components/signals/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface SignalJobFormValues {
  clusteringKey: string | null;
}

interface ConfirmSignalJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schemaFields?: SchemaField[];
  isCreating: boolean;
  onConfirm: (values: SignalJobFormValues) => void;
  traceCount: number;
}

export default function ConfirmSignalJobDialog({
  open,
  onOpenChange,
  schemaFields,
  isCreating,
  onConfirm,
  traceCount,
}: ConfirmSignalJobDialogProps) {
  const { control, handleSubmit, watch, setValue, reset } = useForm<SignalJobFormValues>({
    defaultValues: { clusteringKey: null },
  });

  const clusteringKey = watch("clusteringKey");

  const stringFields = useMemo(
    () => (schemaFields ?? []).filter((field) => field.type === "string" && field.name.trim()),
    [schemaFields]
  );

  const isClusteringEnabled = clusteringKey !== null;

  const handleClusteringToggle = useCallback(
    (checked: boolean) => {
      setValue("clusteringKey", checked ? (stringFields[0]?.name ?? null) : null);
    },
    [stringFields, setValue]
  );

  useEffect(() => {
    if (open) {
      reset({ clusteringKey: null });
    }
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Signal Job</DialogTitle>
          <DialogDescription>Produce events based on previous traces</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onConfirm)}>
          <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 px-4 py-2">
            {stringFields.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="clustering-toggle" className="text-sm font-medium">
                      Clustering
                    </Label>
                    <p className="text-xs text-muted-foreground">Cluster based on the field from structured output</p>
                  </div>
                  <Switch
                    id="clustering-toggle"
                    checked={isClusteringEnabled}
                    onCheckedChange={handleClusteringToggle}
                  />
                </div>
                {isClusteringEnabled && (
                  <Controller
                    name="clusteringKey"
                    control={control}
                    render={({ field }) => (
                      <div className="flex flex-wrap gap-1.5">
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
            )}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
              Create job ({traceCount.toLocaleString()} traces)
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
