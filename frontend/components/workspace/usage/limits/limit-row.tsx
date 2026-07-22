"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Info, Loader2, X } from "@/components/ui/icon-lib";
import { cn } from "@/lib/utils";

interface LimitRowProps {
  workspaceId: string;
  limitType: "bytes" | "signal_cost";
  label: string;
  currentValue: number | null;
  unit: string;
  includedLabel: string;
  includedRawValue: number;
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
  includedRawValue,
  toDisplayValue,
  toRawValue,
  onUpdate,
}: LimitRowProps) {
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

  // The limit caps total usage from zero, not overage on top of the included
  // allowance — remind (gently) when it sits below what the tier already covers.
  const effectiveRawValue = hasChanged ? toRawValue(parsedInput) : currentValue;
  const isBelowIncluded = effectiveRawValue !== null && effectiveRawValue < includedRawValue;

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
        toast.error("Error", { description: err.error || "Something went wrong. Please try again later." });
        return;
      }

      toast("Limit updated", { description: `${label} hard limit set to ${parsedInput} ${unit}.` });
      onUpdate();
    } catch {
      toast.error("Error", { description: "Something went wrong. Please try again later." });
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
        toast.error("Error", { description: err.error || "Something went wrong. Please try again later." });
        return;
      }

      setInputText("");
      toast("Limit removed", { description: `${label} hard limit has been removed.` });
      onUpdate();
    } catch {
      toast.error("Error", { description: "Something went wrong. Please try again later." });
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
    <div className="flex flex-col rounded-md border flex-1 p-3 gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground shrink-0">Included: {includedLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center min-w-0 h-9 rounded-md border border-input bg-background overflow-hidden cursor-text transition-[color,box-shadow] focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
          <span className="flex items-center self-stretch px-2.5 text-xs font-medium text-muted-foreground bg-muted/40 border-r select-none shrink-0">
            {unit}
          </span>
          <input
            type="number"
            step="any"
            min="0"
            placeholder="No limit"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 min-w-0 bg-transparent px-3 text-sm tabular-nums text-left placeholder:text-muted-foreground outline-none hide-arrow"
          />
        </label>
        {hasChanged ? (
          <Button type="button" size="sm" className="h-9 shrink-0" onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
            Save
          </Button>
        ) : displayValue !== null ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className={cn("h-9 w-9 shrink-0", isRemoving && "pointer-events-none")}
            onClick={handleRemove}
            disabled={isRemoving}
            title="Remove limit"
          >
            {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5 text-destructive" />}
          </Button>
        ) : null}
      </div>
      {isBelowIncluded && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>
            This limit is below the {includedLabel} already included in your plan. Hard limits cap total usage from
            zero, so usage your plan covers will be blocked once the limit is reached.
          </span>
        </div>
      )}
    </div>
  );
}
