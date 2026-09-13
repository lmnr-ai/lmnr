"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AddModelInput } from "./add-model-input";
import { ModelRow } from "./model-row";
import { type ModelTestStatus } from "./types";

const IDLE: ModelTestStatus = { state: "idle" };

export function ModelsList({
  models,
  onChange,
  statuses = {},
  hint,
  error,
}: {
  models: string[];
  onChange: (models: string[]) => void;
  /** Per-model connection test results; missing entries render as untested. */
  statuses?: Record<string, ModelTestStatus>;
  hint?: string;
  error?: string;
}) {
  const [adding, setAdding] = useState(false);

  const add = (model: string) => {
    if (!models.includes(model)) onChange([...models, model]);
  };

  return (
    <TooltipProvider delayDuration={100}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-secondary-foreground">Models</Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)} disabled={adding}>
            <Plus size={12} className="mr-1" />
            Add
          </Button>
        </div>
        {models.length > 0 || adding ? (
          <ul className="flex flex-col">
            {models.map((model) => (
              <ModelRow
                key={model}
                model={model}
                status={statuses[model] ?? IDLE}
                onRemove={() => onChange(models.filter((m) => m !== model))}
              />
            ))}
            {adding ? (
              <li>
                <AddModelInput onAdd={add} onClose={() => setAdding(false)} />
              </li>
            ) : null}
          </ul>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="min-h-8 rounded-md border border-dashed px-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
          >
            No models yet — add one
          </button>
        )}
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
