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

import { createProjectInWorkspace } from "./create-project";
import { Field } from "./shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: SessionWorkspace[];
  onCreated: (project: SessionProject) => void;
}

// Reachable only from the approval card's project selector, which renders when
// the user has ≥2 projects — so they always have at least one workspace here.
export function CreateProjectDialog({ open, onOpenChange, workspaces, onCreated }: Props) {
  const { toast } = useToast();
  const [projectName, setProjectName] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string>(workspaces[0]?.id ?? "");
  const [creating, setCreating] = useState(false);

  const selectedWorkspace = workspaces.find((w) => w.id === workspaceId);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const project = projectName.trim();
    if (!project || !workspaceId) return;

    setCreating(true);
    try {
      const created = await createProjectInWorkspace(project, workspaceId, selectedWorkspace?.name ?? "");
      if (!created) {
        toast({ variant: "destructive", title: "Project was created without an id" });
        return;
      }
      onCreated(created);
      setProjectName("");
      setWorkspaceId(workspaces[0]?.id ?? "");
    } catch (err) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setCreating(false);
    }
  };

  const disabled = creating || !projectName.trim() || !workspaceId;

  return (
    <Dialog open={open} onOpenChange={(o) => (!creating ? onOpenChange(o) : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>Name a project for the CLI to use.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {workspaces.length > 1 ? (
            <Field label="Workspace" as="div">
              <Select value={workspaceId} onValueChange={setWorkspaceId}>
                <SelectTrigger className="h-9" aria-label="Workspace">
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
              autoFocus
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
