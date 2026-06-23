"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type SessionWorkspace } from "@/lib/actions/cli-auth";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/lib/hooks/use-toast";

import { createProjectInWorkspace, createWorkspaceWithProject } from "./create-project";
import { Centered, Field } from "./index";

interface Props {
  userCode: string;
  workspaces: SessionWorkspace[];
  onApproved: () => void;
  onDenied: () => void;
}

// Zero-project entry point of the CLI-auth flow: a user with no projects skips
// the (empty) picker and lands here. The primary action creates the project and
// THEN authorizes the device — strictly sequential (see onSubmit). Cancel denies.
export function CreateFirstProject({ userCode, workspaces, onApproved, onDenied }: Props) {
  const { toast } = useToast();
  const hasWorkspace = workspaces.length > 0;
  const [projectName, setProjectName] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string>(workspaces[0]?.id ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [denying, setDenying] = useState(false);
  // Remembers a project created on a prior attempt whose approve step failed, so
  // a retry re-approves the SAME project instead of minting a duplicate.
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);

  const selectedWorkspace = workspaces.find((w) => w.id === workspaceId);
  const busy = submitting || denying;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const project = projectName.trim();
    if (!project) return;
    if (!hasWorkspace && !workspaceName.trim()) return;
    if (hasWorkspace && !workspaceId) return;

    setSubmitting(true);
    try {
      // 1) Create the project (and workspace, for a brand-new user) and WAIT for it.
      //    approveDeviceWithProject membership-checks the projectId, so the project
      //    row must exist before we approve — never run these concurrently. A retry
      //    after a failed approve reuses createdProjectId rather than re-creating.
      let projectId = createdProjectId;
      if (!projectId) {
        const created = hasWorkspace
          ? await createProjectInWorkspace(project, workspaceId, selectedWorkspace?.name ?? "")
          : await createWorkspaceWithProject(project, workspaceName.trim());
        if (!created) {
          toast({ variant: "destructive", title: "Project was created without an id" });
          return;
        }
        projectId = created.id;
        setCreatedProjectId(projectId);
      }

      // 2) THEN authorize the device against the now-existing project. A user with
      //    no workspace at all is a brand-new account, so request the onboarding
      //    welcome email (onboarding parity); a user who already had a workspace
      //    has been welcomed before.
      const res = await fetch("/api/cli/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode, projectId, sendWelcome: !hasWorkspace }),
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
    } catch (err) {
      toast({ variant: "destructive", title: err instanceof Error ? err.message : "Something went wrong" });
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel = deny the device authorization (terminal) — same as the picker, so a
  // claimed code never dangles undecided when the user backs out.
  const onCancel = async () => {
    setDenying(true);
    try {
      const { error } = await authClient.device.deny({ userCode });
      if (error) {
        toast({ variant: "destructive", title: error.error_description ?? "Failed to cancel" });
        return;
      }
      onDenied();
    } catch {
      toast({ variant: "destructive", title: "Something went wrong" });
    } finally {
      setDenying(false);
    }
  };

  const disabled = busy || !projectName.trim() || (hasWorkspace ? !workspaceId : !workspaceName.trim());

  return (
    <Centered>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your first project</CardTitle>
          <CardDescription>
            {hasWorkspace ? "Name your first project." : "Name your first workspace and project."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {!hasWorkspace ? (
              <Field label="Workspace name">
                <Input
                  autoFocus
                  placeholder="Workspace name"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  disabled={busy}
                />
              </Field>
            ) : workspaces.length > 1 ? (
              <Field label="Workspace">
                <Select value={workspaceId} onValueChange={setWorkspaceId} disabled={busy}>
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
                disabled={busy}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="flex-1">
                {denying ? "Cancelling…" : "Cancel"}
              </Button>
              <Button type="submit" disabled={disabled} className="flex-1">
                {submitting ? "Creating…" : "Create project"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Centered>
  );
}
