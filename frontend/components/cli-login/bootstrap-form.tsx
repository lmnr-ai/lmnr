"use client";

import { useState } from "react";

import { CliLoginPanel } from "@/components/cli-login/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/use-toast";
import { type AccessibleWorkspace } from "@/lib/workspaces/types";

interface BootstrapFormProps {
  userEmail: string;
  onCreated: (workspace: AccessibleWorkspace) => void;
}

// Empty-state for 0-workspace users: create the first workspace + project so
// the CLI has a project to scope the key to. Session-authed POST.
export function BootstrapForm({ userEmail, onCreated }: BootstrapFormProps) {
  const { toast } = useToast();
  const [workspaceName, setWorkspaceName] = useState("My Workspace");
  const [projectName, setProjectName] = useState("my-project");
  const [bootstrapping, setBootstrapping] = useState(false);

  async function bootstrap() {
    setBootstrapping(true);
    try {
      const res = await fetch("/api/cli-login/init-workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceName, projectName }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({ variant: "destructive", title: err?.error ?? "Failed to create workspace" });
        return;
      }
      const body = (await res.json()) as { workspaceId: string; workspaceName: string; projectId: string };
      onCreated({
        id: body.workspaceId,
        name: body.workspaceName,
        projects: [{ id: body.projectId, name: projectName }],
      });
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setBootstrapping(false);
    }
  }

  return (
    <CliLoginPanel title="Create your first workspace">
      <p className="text-sm text-secondary-foreground">
        Signed in as <span className="font-medium text-foreground">{userEmail}</span>. The CLI needs a project to
        authorize against. Create one below to continue.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cli-bootstrap-workspace-name">Workspace name</Label>
        <Input
          id="cli-bootstrap-workspace-name"
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          disabled={bootstrapping}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cli-bootstrap-project-name">Project name</Label>
        <Input
          id="cli-bootstrap-project-name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          disabled={bootstrapping}
        />
      </div>
      <Button
        type="button"
        disabled={bootstrapping || !workspaceName.trim() || !projectName.trim()}
        onClick={bootstrap}
      >
        {bootstrapping ? "Creating..." : "Create and continue"}
      </Button>
    </CliLoginPanel>
  );
}
