"use client";

import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type SessionProject, type SessionWorkspace } from "@/lib/actions/cli-auth";

import { CreateProjectDialog } from "./create-project-dialog";
import { Field } from "./shared";

interface Props {
  projects: SessionProject[];
  workspaces: SessionWorkspace[];
  value: string;
  onChange: (projectId: string) => void;
  onCreated: (project: SessionProject) => void;
  disabled?: boolean;
}

// Sentinel value for the "+ Create project" dropdown item — opens the modal
// instead of selecting a project.
const CREATE_VALUE = "__create__";

// Group projects under a per-workspace section header (like macOS native
// dropdowns), workspaces sorted A→Z and projects sorted A→Z within each.
function groupByWorkspace(
  projects: SessionProject[]
): { workspaceId: string; workspaceName: string; projects: SessionProject[] }[] {
  const byWorkspace = new Map<string, { workspaceName: string; projects: SessionProject[] }>();
  for (const p of projects) {
    const group = byWorkspace.get(p.workspaceId);
    if (group) group.projects.push(p);
    else byWorkspace.set(p.workspaceId, { workspaceName: p.workspaceName, projects: [p] });
  }
  return [...byWorkspace.entries()]
    .map(([workspaceId, g]) => ({
      workspaceId,
      workspaceName: g.workspaceName,
      projects: [...g.projects].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.workspaceName.localeCompare(b.workspaceName));
}

// Shown on the approval card only when the user has more than one project —
// with 0 or 1 the CLI's project is resolved server-side and nothing is rendered.
export function ProjectSelect({ projects, workspaces, value, onChange, onCreated, disabled }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);

  const onSelectChange = (next: string) => {
    if (next === CREATE_VALUE) {
      setDialogOpen(true);
      return;
    }
    onChange(next);
  };

  return (
    <>
      <Field label="Project" as="div">
        <Select value={value} onValueChange={onSelectChange} disabled={disabled}>
          <SelectTrigger className="h-9" aria-label="Project">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            {groupByWorkspace(projects).map((g) => (
              <SelectGroup key={g.workspaceId}>
                <SelectLabel className="text-xs font-normal text-muted-foreground">{g.workspaceName}</SelectLabel>
                {g.projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            <SelectSeparator />
            <SelectItem value={CREATE_VALUE}>+ Create project</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaces={workspaces}
        onCreated={(project) => {
          onCreated(project);
          setDialogOpen(false);
        }}
      />
    </>
  );
}
