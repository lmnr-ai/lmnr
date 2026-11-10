"use client";

import { Fingerprint } from "lucide-react";
import { useState } from "react";

import { CardExpandIndicator } from "@/components/ui/card-expand-indicator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { type AgentDefinition as Definition } from "@/lib/actions/agents";

import DefinitionRule from "./definition-rule";

/** Mirrors app-server `agent_versioning::definition::OPENING_CHARS`. */
const OPENING_CHARS = 10_000;

export default function AgentDefinition({ definition }: { definition: Definition | null }) {
  const [open, setOpen] = useState(false);

  if (!definition || definition.any_of.length === 0) return null;

  const rules = definition.any_of;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-emphasis-1 transition-colors"
        >
          <Fingerprint size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium">Definition</span>
          <span className="text-xs text-muted-foreground">
            {rules.length} {rules.length === 1 ? "rule" : "rules"}
          </span>
          <CardExpandIndicator expanded={open} className="ml-auto" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-3 border-t px-3 py-3">
          <p className="text-xs text-muted-foreground">
            A span belongs to this agent when {rules.length === 1 ? "this rule matches" : "any of these rules matches"}{" "}
            the system prompt (truncated to first {OPENING_CHARS / 1000}k characters, case and whitespace ignored).
          </p>
          <ul className="flex flex-col divide-y rounded-md border bg-emphasis-0.5">
            {rules.map((substrings, i) => (
              <DefinitionRule key={i} substrings={substrings} />
            ))}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
