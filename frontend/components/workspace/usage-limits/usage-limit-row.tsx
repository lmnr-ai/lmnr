"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface UsageLimitRowProps {
  workspaceId: string;
  limitType: "bytes" | "signal_runs";
  label: string;
  description: string;
  currentValue: number | null;
  unit: string;
  toDisplayValue: (raw: number) => number;
  toRawValue: (display: number) => number;
  onUpdate: () => void;
}

interface LimitForm {
  value: string;
}

export default function UsageLimitRow({
  workspaceId,
  limitType,
  label,
  description,
  currentValue,
  unit,
  toDisplayValue,
  toRawValue,
  onUpdate,
}: UsageLimitRowProps) {
  const { toast } = useToast();
  const [isRemoving, setIsRemoving] = useState(false);

  const form = useForm<LimitForm>({
    values: {
      value: currentValue !== null ? String(toDisplayValue(currentValue)) : "",
    },
    mode: "onChange",
  });

  const onSubmit = form.handleSubmit(async (data) => {
    const displayVal = parseFloat(data.value);
    if (isNaN(displayVal) || displayVal < 0) {
      toast({ variant: "destructive", title: "Error", description: "Please enter a valid positive number." });
      return;
    }

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/usage-limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limitType, limitValue: toRawValue(displayVal) }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast({ variant: "destructive", title: "Error", description: err.error || "Failed to save limit." });
        return;
      }

      toast({ title: "Limit saved", description: `${label} hard limit updated.` });
      onUpdate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to save limit." });
    }
  });

  const onRemove = async () => {
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/usage-limits`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limitType }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast({ variant: "destructive", title: "Error", description: err.error || "Failed to remove limit." });
        return;
      }

      form.reset({ value: "" });
      toast({ title: "Limit removed", description: `${label} hard limit removed.` });
      onUpdate();
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to remove limit." });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <Controller
          name="value"
          control={form.control}
          rules={{
            validate: (v) => {
              if (v === "") return true;
              const n = parseFloat(v);
              return (!isNaN(n) && n >= 0) || "Must be a positive number";
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
                  placeholder="No limit"
                  className={cn("w-40", fieldState.error && "border-destructive")}
                />
                <span className="text-sm text-muted-foreground">{unit}</span>
              </div>
              {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
            </div>
          )}
        />
        <Button type="submit" size="sm" disabled={!form.formState.isDirty || form.formState.isSubmitting}>
          <Loader2 className={cn("mr-1 h-3 w-3", form.formState.isSubmitting ? "animate-spin" : "hidden")} />
          Save
        </Button>
        {currentValue !== null && (
          <Button type="button" size="sm" variant="ghost" onClick={onRemove} disabled={isRemoving}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </form>
    </div>
  );
}
