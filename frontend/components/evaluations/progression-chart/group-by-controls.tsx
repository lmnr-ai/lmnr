"use client";

import { X } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  selectTriggerWithIconClassName,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { type MetadataKeyInfo } from "./grouping";
import { type ProgressionView } from "./shared";

interface GroupByControlsProps {
  metadataKeys: MetadataKeyInfo[];
  groupBy: string | null;
  onGroupByChange: (key: string | null) => void;
  view: ProgressionView;
  onViewChange: (view: ProgressionView) => void;
}

const VIEWS: { value: ProgressionView; label: string }[] = [
  { value: "trend", label: "Trend" },
  { value: "breakdown", label: "Breakdown" },
];

export default function GroupByControls({
  metadataKeys,
  groupBy,
  onGroupByChange,
  view,
  onViewChange,
}: GroupByControlsProps) {
  // Constant keys can't split runs, so they're listed but disabled.
  const varying = metadataKeys.filter((k) => k.distinctValues > 1);
  const constant = metadataKeys.filter((k) => k.distinctValues <= 1);

  return (
    <>
      <div className="flex items-center h-7 rounded-md border bg-background">
        <Select value={groupBy ?? ""} onValueChange={onGroupByChange} disabled={metadataKeys.length === 0}>
          <SelectTrigger className={cn("w-fit h-full border-0 gap-1.5", selectTriggerWithIconClassName)}>
            <span>Group by</span>
            {groupBy && <span className="font-medium">{groupBy}</span>}
          </SelectTrigger>
          <SelectContent>
            <KeyGroup label="Varies across runs" keys={varying} />
            <KeyGroup label="Same for all runs" keys={constant} disabled />
          </SelectContent>
        </Select>
        {groupBy && (
          <button
            type="button"
            aria-label="Clear grouping"
            title="Clear grouping"
            onClick={() => onGroupByChange(null)}
            className="flex items-center h-full px-1.5 border-l text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      {groupBy && (
        <div className="flex items-center h-7 p-0.5 rounded-md border bg-background">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => onViewChange(v.value)}
              className={cn(
                "h-full px-2 rounded-sm text-xs",
                view === v.value
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function KeyGroup({ label, keys, disabled }: { label: string; keys: MetadataKeyInfo[]; disabled?: boolean }) {
  if (keys.length === 0) return null;
  return (
    <SelectGroup>
      <SelectLabel className="text-[10px] font-medium text-muted-foreground">{label}</SelectLabel>
      {keys.map((k) => (
        <SelectItem key={k.key} value={k.key} disabled={disabled}>
          <span className="flex items-center gap-3 w-full">
            <span className="truncate">{k.key}</span>
            {!disabled && (
              <span className="ml-auto text-muted-foreground tabular-nums">
                {k.distinctValues} {k.distinctValues === 1 ? "value" : "values"}
              </span>
            )}
          </span>
        </SelectItem>
      ))}
    </SelectGroup>
  );
}
