"use client";

import { Info } from "lucide-react";
import { useState } from "react";

import { CardExpandIndicator } from "@/components/ui/card-expand-indicator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type AgentDefinition as Definition } from "@/lib/actions/agents";
import { fetchApi } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";

import AddRuleForm from "./add-rule-form";
import DefinitionRule from "./definition-rule";

/** Mirrors app-server `agent_versioning::definition::OPENING_CHARS`. */
const OPENING_CHARS = 10_000;

const LAST_RULE_ERROR = "At least one rule should exist per agent.";

interface AgentDefinitionProps {
  projectId: string;
  agentId: string;
  definition: Definition | null;
  onChange: () => Promise<unknown>;
}

export default function AgentDefinition({ projectId, agentId, definition, onChange }: AgentDefinitionProps) {
  const [open, setOpen] = useState(false);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [confirmIndex, setConfirmIndex] = useState<number | null>(null);
  const { toast } = useToast();

  if (!definition || definition.any_of.length === 0) return null;

  const rules = definition.any_of;

  const saveRule = async (method: "POST" | "DELETE", substrings: string[]) => {
    const { error } = await fetchApi<Definition>(`/api/projects/${projectId}/agents/${agentId}/rules`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ substrings }),
    });
    if (error !== null) {
      toast({
        variant: "destructive",
        title: method === "POST" ? "Failed to add rule" : "Failed to remove rule",
        description: error,
      });
      return false;
    }
    await onChange();
    return true;
  };

  const removeRule = async (index: number) => {
    setRemovingIndex(index);
    await saveRule("DELETE", rules[index]);
    setRemovingIndex(null);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-emphasis-1 transition-colors"
        >
          <span className="text-sm font-medium">Definition</span>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Clicking the icon shouldn't toggle the card. */}
              <span className="text-muted-foreground" onClick={(e) => e.stopPropagation()}>
                <Info size={12} />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-md">
              Laminar generates these rules automatically
              <br />
              and may add more over time.
            </TooltipContent>
          </Tooltip>
          <CardExpandIndicator expanded={open} className="ml-auto" />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-3 border-t px-3 py-3">
          <p className="text-xs text-muted-foreground">
            A span belongs to this agent when any of these rules matches the system prompt (truncated to first{" "}
            {OPENING_CHARS / 1000}k characters, case and whitespace ignored). Changes apply to new spans only.
          </p>
          <ul className="flex flex-col divide-y rounded-md border bg-emphasis-0.5">
            {rules.map((substrings, i) => (
              <DefinitionRule
                key={substrings.join("\u0000")}
                substrings={substrings}
                onRemove={() => setConfirmIndex(i)}
                disabledReason={rules.length === 1 ? LAST_RULE_ERROR : undefined}
                isRemoving={removingIndex === i}
              />
            ))}
          </ul>
          <AddRuleForm onAdd={(substrings) => saveRule("POST", substrings)} />
        </div>
      </CollapsibleContent>
      <ConfirmDialog
        open={confirmIndex !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmIndex(null);
        }}
        title="Remove rule"
        description="New spans that only this rule matches will no longer belong to this agent. Existing traces keep their agent."
        confirmText="Remove"
        onConfirm={() => {
          if (confirmIndex !== null) removeRule(confirmIndex);
        }}
      />
    </Collapsible>
  );
}
