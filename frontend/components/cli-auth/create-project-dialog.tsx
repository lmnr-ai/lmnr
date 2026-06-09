"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type SessionProject, type SessionWorkspace } from "@/lib/actions/cli-auth";
import { useToast } from "@/lib/hooks/use-toast";

import { Field } from "./index";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: SessionWorkspace[];
  onCreated: (project: SessionProject) => void;
}

export function CreateProjectDialog({ open, onOpenChange, workspaces, onCreated }: Props) {
  const { toast } = useToast();
  const hasWorkspace = workspaces.length > 0;
  const [projectName, setProjectName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string>(workspaces[0]?.id ?? "");
  const [creating, setCreating] = useState(false);

  const selectedWorkspace = workspaces.find((w) => w.id === workspaceId);

  const reset = () => {
    setProjectName("");
    setWorkspaceName("");
    setWorkspaceId(workspaces[0]?.id ?? "");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const project = projectName.trim();
    if (!project) return;
    if (!hasWorkspace && !workspaceName.trim()) return;
    if (hasWorkspace && !workspaceId) return;

    setCreating(true);
    try {
      // Branch A — has ≥1 workspace: create a project inside the chosen workspace.
      // Branch B — 0 workspaces (brand-new user): create workspace + first project.
      const created = hasWorkspace
        ? await createInWorkspace(project, workspaceId, selectedWorkspace?.name ?? "")
        : await createWorkspaceWithProject(project, workspaceName.trim());

      if (!created) {
        toast({ variant: "destructive", title: "Project was created without an id" });
        return;
      }
      onCreated(created);
      reset();
    } catch (err) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setCreating(false);
    }
  };

  const disabled = creating || !projectName.trim() || (hasWorkspace ? !workspaceId : !workspaceName.trim());

  return (
    <Dialog open={open} onOpenChange={(o) => (!creating ? onOpenChange(o) : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{hasWorkspace ? "Create project" : "Create your first project"}</DialogTitle>
          <DialogDescription>
            {hasWorkspace ? "Name a project for the CLI to use." : "Name a workspace and project for the CLI to use."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {!hasWorkspace ? (
            <Field label="Workspace name">
              <Input
                autoFocus
                placeholder="Workspace name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
              />
            </Field>
          ) : workspaces.length > 1 ? (
            <Field label="Workspace">
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select a workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}
          <Field label="Project name">
            <Input
              autoFocus={hasWorkspace}
              placeholder="Project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" disabled={disabled}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Branch A: existing workspace → POST /api/workspaces/:workspaceId/projects.
async function createInWorkspace(
  name: string,
  workspaceId: string,
  workspaceName: string
): Promise<SessionProject | null> {
  const res = await fetch(`/api/workspaces/${workspaceId}/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const errMessage = await res
      .json()
      .then((d) => d?.error)
      .catch(() => null);
    throw new Error(errMessage ?? "Failed to create project");
  }
  const project = await res.json();
  if (!project?.id) return null;
  return { id: project.id, name, workspaceId, workspaceName };
}

// Branch B: brand-new user → POST /api/workspaces { isFirstProject: true }.
async function createWorkspaceWithProject(name: string, workspaceName: string): Promise<SessionProject | null> {
  const res = await fetch("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: workspaceName, projectName: name, isFirstProject: true }),
  });
  if (!res.ok) {
    const errMessage = await res
      .json()
      .then((d) => d?.error)
      .catch(() => null);
    throw new Error(errMessage ?? "Failed to create project");
  }
  const data = await res.json();
  if (!data?.projectId) return null;
  return { id: data.projectId, name, workspaceId: data.id ?? "", workspaceName };
}
