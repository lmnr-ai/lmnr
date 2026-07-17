"use client";

import { X } from "lucide-react";
import { Fragment } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { type DimensionOption } from "./dimensions";
import SignalBreakdownIcon from "./signal-breakdown-icon";
import { type BreakdownNode } from "./types";

interface Props {
  dimensions: DimensionOption[];
  currentKey: string;
  onDimensionChange: (key: string) => void;
  breadcrumb: BreakdownNode[];
  onNavigateToBreadcrumb: (index: number) => void;
}

/**
 * Breadcrumb trail whose ROOT is the breakdown-dimension dropdown; each drilled
 * level is a pill. Clicking a pill drills to that level; the pill's leading X
 * removes that level (and everything below it), stepping up to its parent.
 */
export default function SignalBreakdownBreadcrumbs({
  dimensions,
  currentKey,
  onDimensionChange,
  breadcrumb,
  onNavigateToBreadcrumb,
}: Props) {
  return (
    <div className="flex items-center text-xs w-full min-w-0 gap-1.5">
      <Select value={currentKey} onValueChange={onDimensionChange}>
        <SelectTrigger className="w-fit gap-1.5 text-xs" aria-label="Breakdown dimension">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {dimensions.map((d) => (
            <SelectItem key={d.key} value={d.key}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {breadcrumb.map((node, index) => (
        <Fragment key={node.id}>
          {/* Extra gap only before the first slash (dropdown → trail); slash↔pill stays tight. */}
          <span className={cn("shrink-0 text-sm text-muted-foreground", index === 0 && "ml-2")}>/</span>
          <div
            role="button"
            tabIndex={0}
            onClick={() => onNavigateToBreadcrumb(index)}
            className="group flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-full border border-border bg-secondary px-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <div className="flex min-w-0 items-center gap-1">
              <SignalBreakdownIcon icon={node.icon} />
              <span className="truncate font-medium">{node.name}</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Remove this level → select its parent (index-1; -1 clears to root).
                onNavigateToBreadcrumb(index - 1);
              }}
              className="shrink-0 rounded-full text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${node.name}`}
            >
              <X className="size-3" />
            </button>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
