"use client";

import { Loader2 } from "lucide-react";
import { useRef } from "react";
import { useFormContext } from "react-hook-form";

import TagInput, { type FocusableRef } from "@/components/common/advanced-search/components/tag-input";
import {
  getSpanNameCondition,
  getTriggerKind,
  getTriggerSpanNames,
  TRIGGER_KIND,
} from "@/components/signals/trigger-filter-field";
import { cn } from "@/lib/utils";

import { type ManageSignalForm } from "../types";
import { TRIGGER_INDEX } from "./constants";
import { useSpanNameSuggestions } from "./use-span-name-suggestions";

export default function SpanNamesField() {
  const { watch, setValue, register } = useFormContext<ManageSignalForm>();
  const inputRef = useRef<FocusableRef>(null);
  const conditions = watch(`triggers.${TRIGGER_INDEX}.conditions`) ?? [];
  const spanNames = getTriggerSpanNames(conditions).filter((name) => name.trim() !== "");
  const { spanNames: suggestions, isLoading } = useSpanNameSuggestions();

  // Registered (not rendered) purely so a trigger that would never fire fails
  // `isValid` and keeps the Save button disabled — the field writes via setValue.
  register(`triggers.${TRIGGER_INDEX}.conditions`, {
    validate: (value) =>
      getTriggerKind(value ?? []) !== TRIGGER_KIND.SPAN_NAME ||
      getTriggerSpanNames(value ?? []).some((name) => name.trim() !== "") ||
      "Enter at least one span name",
  });

  // `shouldValidate` because setValue skips validation by default, and the rule
  // above is what gates Save.
  const write = (next: string[]) =>
    setValue(`triggers.${TRIGGER_INDEX}.conditions`, [getSpanNameCondition(next)], {
      shouldDirty: true,
      shouldValidate: true,
    });

  return (
    <div className="grid gap-1.5">
      <div
        className={cn(
          "flex flex-wrap items-center gap-1 min-h-8 rounded-md border bg-secondary px-1.5 py-1 cursor-text",
          "focus-within:border-primary",
          spanNames.length === 0 && "border-destructive/60"
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <TagInput
          ref={inputRef}
          values={spanNames}
          onChange={write}
          suggestions={suggestions}
          alwaysEditable
          placeholder="Type or pick a span name, e.g. agent.run"
          inputClassName="h-6 text-xs placeholder:text-muted-foreground"
          className="flex-1 flex-wrap gap-1 px-0 min-w-0"
        />
        {isLoading && <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground" />}
      </div>
      {spanNames.length === 0 && (
        <span className="text-xs text-destructive">Add at least one span name, or this signal will never run.</span>
      )}
    </div>
  );
}
