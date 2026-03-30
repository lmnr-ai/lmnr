"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface UsageWarningRowProps {
  workspaceId: string;
  id: string;
  displayValue: number;
  unit: string;
  onRemove: () => void;
}

export default function UsageWarningRow({ workspaceId, id, displayValue, unit, onRemove }: UsageWarningRowProps) {
  const { toast } = useToast();
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/usage-warnings`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast({ variant: "destructive", title: "Error", description: err.error || "Failed to remove warning." });
        return;
      }

      toast({ title: "Warning removed" });
      onRemove();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to remove warning." });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-secondary-foreground w-32 tabular-nums">
        {displayValue} {unit}
      </span>
      <Button type="button" size="sm" variant="ghost" onClick={handleRemove} disabled={isRemoving}>
        {isRemoving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        )}
      </Button>
    </div>
  );
}

interface AddWarningFormProps {
  workspaceId: string;
  usageItem: "bytes" | "signal_runs";
  unit: string;
  toRawValue: (display: number) => number;
  onAdd: () => void;
}

interface AddWarningFormData {
  value: string;
}

export function AddWarningForm({ workspaceId, usageItem, unit, toRawValue, onAdd }: AddWarningFormProps) {
  const { toast } = useToast();

  const form = useForm<AddWarningFormData>({
    defaultValues: { value: "" },
    mode: "onChange",
  });

  const onSubmit = form.handleSubmit(async (data) => {
    const displayVal = parseFloat(data.value);
    if (isNaN(displayVal) || displayVal <= 0) {
      toast({ variant: "destructive", title: "Error", description: "Please enter a positive number." });
      return;
    }

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/usage-warnings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usageItem, limitValue: toRawValue(displayVal) }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast({ variant: "destructive", title: "Error", description: err.error || "Failed to add warning." });
        return;
      }

      form.reset({ value: "" });
      toast({ title: "Warning added" });
      onAdd();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to add warning." });
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <Controller
        name="value"
        control={form.control}
        rules={{
          validate: (v) => {
            if (v === "") return true;
            const n = parseFloat(v);
            return (!isNaN(n) && n > 0) || "Must be a positive number";
          },
        }}
        render={({ field, fieldState }) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                {...field}
                type="number"
                step="any"
                min="0"
                placeholder={`Add threshold (${unit})`}
                className={cn("w-44", fieldState.error && "border-destructive")}
              />
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
            {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
          </div>
        )}
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={!form.formState.isDirty || form.formState.isSubmitting}
      >
        <Loader2 className={cn("mr-1 h-3 w-3", form.formState.isSubmitting ? "animate-spin" : "hidden")} />
        Add
      </Button>
    </form>
  );
}
