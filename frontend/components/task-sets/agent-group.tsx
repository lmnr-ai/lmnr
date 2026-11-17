"use client";

import { FileCode } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type AgentGroup as AgentGroupType } from "@/lib/actions/task-sets/types";

import AgentScriptsSheet from "./agent-scripts/sheet";
import DeleteButton from "./delete-button";
import TaskSetRow from "./task-set-row";
import { versionLabel } from "./utils";

interface AgentGroupProps {
  projectId: string;
  agent: AgentGroupType;
  onChanged: () => void;
}

/** One agent: its name and scripts, then its task sets. */
export default function AgentGroup({ projectId, agent, onChanged }: AgentGroupProps) {
  const [scriptsOpen, setScriptsOpen] = useState(false);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">{agent.name}</h2>
        {agent.head && (
          <span className="text-xs text-secondary-foreground">scripts {versionLabel(agent.head.number)}</span>
        )}
        <div className="flex-1" />
        <Button variant="outline" className="gap-2" onClick={() => setScriptsOpen(true)}>
          <FileCode className="size-3.5" />
          Agent scripts
        </Button>
        <DeleteButton
          url={`/api/projects/${projectId}/eval-agents/${agent.id}`}
          title={`Delete agent ${agent.name}`}
          description={`This deletes ${agent.name}, its scripts and its ${agent.taskSets.length} task set(s). Evaluations keep their results.`}
          onDeleted={onChanged}
        />
      </div>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task set</TableHead>
              <TableHead className="w-28">Version</TableHead>
              <TableHead className="w-28">Tasks</TableHead>
              <TableHead className="w-48">Updated</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {agent.taskSets.map((taskSet) => (
              <TaskSetRow key={taskSet.id} projectId={projectId} taskSet={taskSet} onDeleted={onChanged} />
            ))}
          </TableBody>
        </Table>
        {agent.taskSets.length === 0 && (
          <div className="p-4 text-center text-xs text-secondary-foreground">This agent has no task sets.</div>
        )}
      </div>
      <AgentScriptsSheet projectId={projectId} agent={agent} open={scriptsOpen} onOpenChange={setScriptsOpen} />
    </section>
  );
}
