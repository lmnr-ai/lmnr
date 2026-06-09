"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/lib/hooks/use-toast";

import { CreateProjectDialog } from "./create-project-dialog";
import { Centered } from "./index";

interface Props {
  userCode: string;
  projects: SessionProject[];
  workspaces: SessionWorkspace[];
  onApproved: () => void;
}

// Sentinel value for the "+ Create project" dropdown item — opens the modal
// instead of selecting a project.
const CREATE_VALUE = "__create__";

// Group projects under a per-workspace section header (like macOS native
// dropdowns), workspaces sorted A→Z and projects sorted A→Z within each.
function groupByWorkspace(
  projects: SessionProject[],
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

export function ProjectPicker({ userCode, projects, workspaces, onApproved }: Props) {
  const { toast } = useToast();
  const [options, setOptions] = useState<SessionProject[]>(projects);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Writes the chosen projectId into the pending device row's scope, then approves.
  const onConfirm = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/cli/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode, projectId: selectedId }),
      });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to authorize device" });
        return;
      }
      onApproved();
    } catch {
      toast({ variant: "destructive", title: "Something went wrong" });
    } finally {
      setSubmitting(false);
    }
  };

  const onSelectChange = (value: string) => {
    if (value === CREATE_VALUE) {
      setDialogOpen(true);
      return;
    }
    setSelectedId(value);
  };

  // New project lands in the dropdown and becomes the selection — but does NOT
  // approve; the single Confirm CTA stays the only approve trigger.
  const onProjectCreated = (project: SessionProject) => {
    setOptions((prev) => [project, ...prev.filter((p) => p.id !== project.id)]);
    setSelectedId(project.id);
    setDialogOpen(false);
  };

  return (
    <Centered>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Select a project</CardTitle>
          <CardDescription>Choose the project the CLI should use in this directory.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Select value={selectedId ?? undefined} onValueChange={onSelectChange} disabled={submitting}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {groupByWorkspace(options).map((g) => (
                <SelectGroup key={g.workspaceId}>
                  <SelectLabel className="text-xs font-normal text-muted-foreground">
                    {g.workspaceName}
                  </SelectLabel>
                  {g.projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
              {options.length > 0 ? <SelectSeparator /> : null}
              <SelectItem value={CREATE_VALUE}>+ Create project</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" onClick={onConfirm} disabled={!selectedId || submitting}>
            {submitting ? "Authorizing…" : "Continue"}
          </Button>
        </CardContent>
      </Card>
      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaces={workspaces}
        onCreated={onProjectCreated}
      />
    </Centered>
  );
}
