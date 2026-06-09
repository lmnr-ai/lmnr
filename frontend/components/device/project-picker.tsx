"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type SessionProject } from "@/lib/actions/device";
import { useToast } from "@/lib/hooks/use-toast";

import { Centered, UserCodeDisplay } from "./index";

interface Props {
  userCode: string;
  rawUserCode: string;
  projects: SessionProject[];
  onApproved: () => void;
}

export function ProjectPicker({ userCode, rawUserCode, projects, onApproved }: Props) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  // Writes the chosen projectId into the pending device row's scope, then approves.
  const approveWithProject = async (projectId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/cli/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode, projectId }),
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

  if (projects.length === 0) {
    return <CreateFirstProject rawUserCode={rawUserCode} onCreated={approveWithProject} submitting={submitting} />;
  }

  return (
    <Centered>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Select a project</CardTitle>
          <CardDescription>Choose the project the CLI should use in this directory.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {rawUserCode ? <UserCodeDisplay code={rawUserCode} /> : null}
          <div className="flex flex-col gap-2">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={submitting}
                onClick={() => approveWithProject(p.id)}
                className="flex flex-col items-start rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
              >
                <span className="text-sm font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">{p.workspaceName}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </Centered>
  );
}

function CreateFirstProject({
  rawUserCode,
  onCreated,
  submitting,
}: {
  rawUserCode: string;
  onCreated: (projectId: string) => Promise<void>;
  submitting: boolean;
}) {
  const { toast } = useToast();
  const [workspaceName, setWorkspaceName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim() || !projectName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName.trim(), projectName: projectName.trim(), isFirstProject: true }),
      });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to create project" });
        return;
      }
      const { projectId } = await res.json();
      if (!projectId) {
        toast({ variant: "destructive", title: "Project was created without an id" });
        return;
      }
      await onCreated(projectId);
    } catch {
      toast({ variant: "destructive", title: "Something went wrong" });
    } finally {
      setCreating(false);
    }
  };

  const busy = creating || submitting;
  return (
    <Centered>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your first project</CardTitle>
          <CardDescription>Name a workspace and project for the CLI to use.</CardDescription>
        </CardHeader>
        <CardContent>
          {rawUserCode ? <UserCodeDisplay code={rawUserCode} /> : null}
          <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
            <Input
              placeholder="Workspace name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
            />
            <Input placeholder="Project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            <Button type="submit" disabled={busy || !workspaceName.trim() || !projectName.trim()}>
              {busy ? "Creating…" : "Create and continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Centered>
  );
}
