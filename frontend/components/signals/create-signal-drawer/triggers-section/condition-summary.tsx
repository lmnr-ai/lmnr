"use client";

import { useFormContext } from "react-hook-form";

import { type ManageSignalForm } from "../types";
import { buildConditionSummary } from "./build-condition-summary";
import { TRIGGER_INDEX } from "./constants";

export default function ConditionSummary() {
  const { watch } = useFormContext<ManageSignalForm>();
  const conditions = watch(`triggers.${TRIGGER_INDEX}.conditions`) ?? [];
  const filters = watch(`triggers.${TRIGGER_INDEX}.filters`) ?? [];
  const parts = buildConditionSummary(conditions, filters);

  if (!parts) return null;

  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {parts.map((part, i) =>
          part.type === "name" ? (
            <code
              key={`${part.value}-${i}`}
              className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground"
            >
              {part.value}
            </code>
          ) : (
            <span key={i}>{part.text}</span>
          )
        )}
      </p>
    </div>
  );
}
