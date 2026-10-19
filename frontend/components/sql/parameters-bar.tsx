"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import ParameterInput from "@/components/sql/parameter-input";
import {
  BUILT_IN_PARAMETERS,
  formatParameterDisplay,
  formatParameterValue,
  isParameterUnset,
  type SQLParameter,
} from "@/components/sql/parameters";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ParametersBarProps {
  parameters: SQLParameter[];
  onChange: (name: string, value?: SQLParameter["value"]) => void;
  conflicts?: Record<string, string[]>;
  className?: string;
  /** Name whose input should be open, set by a click on the placeholder in the editor. */
  focusedParameter?: string | null;
  /** Returns true when it moved focus itself (back into the editor), so Radix must not. */
  onFocusedParameterHandled?: () => boolean;
}

/**
 * The query's parameters, always on screen — they used to sit in a tab, which is why nobody found
 * them. Rides in the results tab strip so it costs no editor height, and wraps rather than scrolling
 * so an off-screen unset parameter can't hide. Renders nothing when the query has no placeholders.
 */
const ParametersBar = ({
  parameters,
  onChange,
  conflicts,
  className,
  focusedParameter,
  onFocusedParameterHandled,
}: ParametersBarProps) => {
  if (parameters.length === 0) return null;

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center justify-end gap-1.5", className)}>
      {parameters.map((parameter) => (
        <ParameterChip
          key={parameter.name}
          parameter={parameter}
          onChange={onChange}
          conflictTypes={conflicts?.[parameter.name]}
          open={focusedParameter === parameter.name}
          onOpenHandled={onFocusedParameterHandled}
        />
      ))}
    </div>
  );
};

export default ParametersBar;

const ParameterChip = ({
  parameter,
  onChange,
  conflictTypes,
  open,
  onOpenHandled,
}: {
  parameter: SQLParameter;
  onChange: ParametersBarProps["onChange"];
  conflictTypes?: string[];
  open: boolean;
  onOpenHandled?: () => boolean;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Read by `onCloseAutoFocus` right after: a chip opened from the bar keeps Radix's restore-to-trigger.
  const focusReturnedToEditor = useRef(false);
  const unset = isParameterUnset(parameter);
  const display = formatParameterDisplay(parameter);
  const sent = formatParameterValue(parameter);
  const description = BUILT_IN_PARAMETERS[parameter.name]?.description;

  // A wrapped row can sit below the fold of a short results panel.
  useEffect(() => {
    if (open) triggerRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [open]);

  return (
    <Popover
      open={isOpen || open}
      onOpenChange={(next) => {
        setIsOpen(next);
        if (!next) focusReturnedToEditor.current = onOpenHandled?.() ?? false;
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={cn(
            "flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors hover:bg-surface-up-2",
            unset && "border-amber-500/50 text-amber-500"
          )}
        >
          {unset && <AlertTriangle className="size-3 shrink-0" />}
          <span className={cn("max-w-28 truncate font-mono", unset ? "text-amber-500/80" : "text-muted-foreground")}>
            {parameter.name}
          </span>
          <span className="max-w-28 truncate">{display ?? "Not set"}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("space-y-2 p-3", parameter.type === "date" ? "w-auto" : "w-72")}
        onCloseAutoFocus={(event) => {
          if (focusReturnedToEditor.current) event.preventDefault();
          focusReturnedToEditor.current = false;
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-xs font-medium">{parameter.name}</span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {parameter.declaredType ?? parameter.type}
          </span>
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {conflictTypes?.length ? (
          <div className="flex items-start gap-1 text-xs text-amber-500">
            <AlertTriangle className="mt-0.5 size-3 shrink-0" />
            <span>
              Declared as {conflictTypes.join(" and ")} in this query. ClickHouse binds one value per name, so the first
              declaration wins.
            </span>
          </div>
        ) : null}
        <ParameterInput parameter={parameter} onChange={onChange} />
        {/* The literal ClickHouse receives; a date bound to a String parameter silently returns wrong rows. */}
        {sent !== undefined && (
          <p className="truncate font-mono text-[11px] text-muted-foreground" title={String(sent)}>
            Sends {String(sent)}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
};
