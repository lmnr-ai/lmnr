"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface WarningChipProps {
  workspaceId: string;
  id: string;
  displayValue: number;
  unit: string;
  onRemove: () => void;
}

export default function WarningChip({ workspaceId, id, displayValue, unit, onRemove }: WarningChipProps) {
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
        toast({
          variant: "destructive",
          title: "Error",
          description: err.error || "Something went wrong. Please try again later.",
        });
        return;
      }

      toast({
        title: "Warning removed",
        description: `${displayValue} ${unit} threshold has been removed.`,
      });
      onRemove();
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong. Please try again later.",
      });
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <Badge variant="secondary" className="gap-1.5 pl-2.5 pr-1 py-1 text-xs font-medium tabular-nums">
      {displayValue} {unit}
      <button
        type="button"
        onClick={handleRemove}
        disabled={isRemoving}
        className="rounded-sm hover:bg-muted-foreground/20 p-0.5 transition-colors"
      >
        {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 text-muted-foreground" />}
      </button>
    </Badge>
  );
}

interface AddWarningPopoverProps {
  workspaceId: string;
  usageItem: "bytes" | "signal_runs";
  unit: string;
  toRawValue: (display: number) => number;
  onAdd: () => void;
}

interface AddWarningFormData {
  value: string;
}

export function AddWarningPopover({ workspaceId, usageItem, unit, toRawValue, onAdd }: AddWarningPopoverProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const form = useForm<AddWarningFormData>({
    defaultValues: { value: "" },
    mode: "onChange",
  });

  const onSubmit = form.handleSubmit(async (data) => {
    const displayVal = parseFloat(data.value);
    if (isNaN(displayVal) || displayVal <= 0) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please enter a positive number.",
      });
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
        toast({
          variant: "destructive",
          title: "Error",
          description: err.error || "Something went wrong. Please try again later.",
        });
        return;
      }

      form.reset({ value: "" });
      setOpen(false);
      toast({
        title: "Warning added",
        description: `You'll be notified when usage reaches ${displayVal} ${unit}.`,
      });
      onAdd();
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong. Please try again later.",
      });
    }
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs">
          <Plus className="h-3 w-3" />
          Add
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-3">
        <form onSubmit={onSubmit} className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Threshold ({unit})</span>
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
                <div className="relative">
                  <Input
                    {...field}
                    type="number"
                    step="any"
                    min="0"
                    autoFocus
                    placeholder="e.g. 5"
                    className={cn("pr-10 hide-arrow", fieldState.error && "border-destructive")}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-secondary-foreground hide-arrow pointer-events-none">
                    {unit}
                  </span>
                </div>
                {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
              </div>
            )}
          />
          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={!form.formState.isDirty || form.formState.isSubmitting}
          >
            <Loader2 className={cn("mr-1 h-3 w-3", form.formState.isSubmitting ? "animate-spin" : "hidden")} />
            Add threshold
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
