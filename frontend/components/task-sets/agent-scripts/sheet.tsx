"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { type AgentGroup } from "@/lib/actions/task-sets/types";

import AgentScripts from ".";

interface AgentScriptsSheetProps {
  projectId: string;
  agent: AgentGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The agent's scripts in a side panel over the Task sets list. */
export default function AgentScriptsSheet({ projectId, agent, open, onOpenChange }: AgentScriptsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[70vw] max-w-none flex-col gap-0 p-0 sm:max-w-none">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>{agent.name}: agent scripts</SheetTitle>
          <SheetDescription>
            The agent&apos;s evals folder, without its task sets, as its last run used it.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <AgentScripts projectId={projectId} agentId={agent.id} agentName={agent.name} scripts={agent.latestScripts} />
        )}
      </SheetContent>
    </Sheet>
  );
}
