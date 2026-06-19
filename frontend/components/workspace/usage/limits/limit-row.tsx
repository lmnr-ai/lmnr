"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LimitRowProps {
  workspaceId: string;
  limitType: "bytes" | "signal_steps_processed";
  label: string;
  currentValue: number | null;
  unit: string;
  includedLabel: string;
  toDisplayValue: (raw: number) => number;
  toRawValue: (display: number) => number;
  onUpdate: () => void;
}

export default function LimitRow({
  workspaceId,
  limitType,
  label,
  currentValue,
  unit,
  includedLabel,
  toDisplayValue,
  toRawValue,
  onUpdate,
}: LimitRowProps) {
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const displayValue = currentValue !== null ? toDisplayValue(currentValue) : null;
  const [inputText, setInputText] = useState(displayValue !== null ? String(displayValue) : "");

  useEffect(() => {
    const dv = currentValue !== null ? toDisplayValue(currentValue) : null;
    setInputText(dv !== null ? String(dv) : "");
  }, [currentValue, toDisplayValue]);

  const parsedInput = parseFloat(inputText);
  const isValidInput = !isNaN(parsedInput) && parsedInput > 0;
  const hasChanged = isValidInput && parsedInput !== displayValue;

  const handleSave = async () => {
    if (!isValidInput) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/usage-limits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limitType, limitValue: toRawValue(parsedInput) }),
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
        title: "Limit updated",
        description: `${label} hard limit set to ${parsedInput} ${unit}.`,
      });
      onUpdate();
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Something went wrong. Please try again later.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/usage-limits`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limitType }),
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

      setInputText("");
      toast({
        title: "Limit removed",
        description: `${label} hard limit has been removed.`,
      });
      onUpdate();
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && hasChanged) {
      e.preventDefault();
      handleSave();
    }
  };

  return (
    <div className="flex flex-col rounded-md border flex-1">
      <div className="flex items-center justify-between px-3 h-10">
        <span className="text-sm font-medium">{label}</span>
        <p className="text-xs text-muted-foreground">Plan includes {includedLabel}</p>
      </div>
      <div className="flex items-center border-t px-4 h-10 gap-2">
        <input
          type="number"
          step="any"
          min="0"
          placeholder="No limit"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent text-sm tabular-nums placeholder:text-muted-foreground outline-none min-w-0 hide-arrow"
        />
        {hasChanged ? (
          <Button
            variant="ghost"
            type="button"
            size="sm"
            className="h-7 shrink-0"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Save
          </Button>
        ) : displayValue !== null ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn("h-7 w-7 shrink-0", isRemoving && "pointer-events-none")}
            onClick={handleRemove}
            disabled={isRemoving}
          >
            {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 text-destructive" />}
          </Button>
        ) : null}
        <span className="text-xs text-secondary-foreground shrink-0">{unit}</span>
      </div>
    </div>
  );
}
