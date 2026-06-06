"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { AddProjectDialog, type CreatedProject } from "@/components/oauth-device/add-project-dialog";
import { OAuthDevicePanel } from "@/components/oauth-device/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/lib/hooks/use-toast";
import { type AccessibleWorkspace } from "@/lib/workspaces/types";

interface OAuthDeviceClientProps {
  userCode: string;
  clientId: string;
  scope: string;
  requestedProjectId: string | null;
  requestedProjectAccessible: boolean;
  workspaces: AccessibleWorkspace[];
  userEmail: string;
}

type Stage = "review" | "approved" | "denied";

export function OAuthDeviceClient(props: OAuthDeviceClientProps) {
  const { requestedProjectId, requestedProjectAccessible } = props;
  const { toast } = useToast();

  // `workspaces` is initially the server-rendered list; if the user
  // bootstraps a workspace inline below, we replace the local copy so the
  // picker renders without a page reload.
  const [workspaces, setWorkspaces] = useState<AccessibleWorkspace[]>(props.workspaces);

  const flatProjects = useMemo(
    () => workspaces.flatMap((w) => w.projects.map((p) => ({ ...p, workspaceName: w.name, workspaceId: w.id }))),
    [workspaces]
  );

  const initialProjectId =
    requestedProjectId && requestedProjectAccessible ? requestedProjectId : (flatProjects[0]?.id ?? "");

  const [stage, setStage] = useState<Stage>("review");
  const [submitting, setSubmitting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId);
  const [bootstrapWorkspaceName, setBootstrapWorkspaceName] = useState("My Workspace");
  const [bootstrapProjectName, setBootstrapProjectName] = useState("my-project");
  const [bootstrapping, setBootstrapping] = useState(false);

  // Add-project targets the workspace of the currently selected project, or
  // the first workspace if nothing is selected yet. The "no workspaces at all"
  // case is handled by the bootstrap branch below so the empty-string fallback
  // is unreachable when the Select is rendered.
  const addProjectWorkspaceId =
    flatProjects.find((p) => p.id === selectedProjectId)?.workspaceId ?? workspaces[0]?.id ?? "";

  function handleProjectCreated(project: CreatedProject) {
    setWorkspaces((current) =>
      current.map((ws) =>
        ws.id === project.workspaceId
          ? { ...ws, projects: [...ws.projects, { id: project.id, name: project.name }] }
          : ws
      )
    );
    setSelectedProjectId(project.id);
  }

  async function bootstrapWorkspace() {
    setBootstrapping(true);
    try {
      const res = await fetch("/api/oauth/device/init-workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceName: bootstrapWorkspaceName,
          projectName: bootstrapProjectName,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({ variant: "destructive", title: err?.error ?? "Failed to create workspace" });
        return;
      }
      const body = (await res.json()) as { workspaceId: string; workspaceName: string; projectId: string };
      const newWorkspace: AccessibleWorkspace = {
        id: body.workspaceId,
        name: body.workspaceName,
        projects: [{ id: body.projectId, name: bootstrapProjectName }],
      };
      setWorkspaces([newWorkspace]);
      setSelectedProjectId(body.projectId);
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setBootstrapping(false);
    }
  }

  async function submitDecision(decision: "approve" | "deny") {
    setSubmitting(true);
    try {
      const res = await fetch("/api/oauth/device/decision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_code: props.userCode,
          decision,
          project_id: decision === "approve" ? selectedProjectId : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({
          variant: "destructive",
          title: err?.error ?? "Failed to submit decision",
        });
        return;
      }
      setStage(decision === "approve" ? "approved" : "denied");
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (stage === "approved") {
    return (
      <OAuthDevicePanel title="All set">
        <p className="text-sm text-secondary-foreground">You are signed in. Return to your terminal to finish setup.</p>
      </OAuthDevicePanel>
    );
  }

  if (stage === "denied") {
    return (
      <OAuthDevicePanel title="Request denied">
        <p className="text-sm text-secondary-foreground">
          The CLI will exit with an error. Run the command again if you change your mind.
        </p>
      </OAuthDevicePanel>
    );
  }

  if (flatProjects.length === 0) {
    return (
      <OAuthDevicePanel title="Create your first workspace">
        <p className="text-sm text-secondary-foreground">
          Signed in as <span className="font-medium text-foreground">{props.userEmail}</span>. The CLI needs a project
          to authorize against. Create one below to continue.
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bootstrap-workspace-name">Workspace name</Label>
          <Input
            id="bootstrap-workspace-name"
            value={bootstrapWorkspaceName}
            onChange={(e) => setBootstrapWorkspaceName(e.target.value)}
            disabled={bootstrapping}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="bootstrap-project-name">Project name</Label>
          <Input
            id="bootstrap-project-name"
            value={bootstrapProjectName}
            onChange={(e) => setBootstrapProjectName(e.target.value)}
            disabled={bootstrapping}
          />
        </div>
        <Button
          type="button"
          disabled={bootstrapping || !bootstrapWorkspaceName.trim() || !bootstrapProjectName.trim()}
          onClick={bootstrapWorkspace}
        >
          {bootstrapping ? "Creating..." : "Create and continue"}
        </Button>
      </OAuthDevicePanel>
    );
  }

  const showFallbackNotice = requestedProjectId && !requestedProjectAccessible;

  return (
    <OAuthDevicePanel title="Authorize Laminar CLI">
      <p className="text-sm text-secondary-foreground">
        Signed in as <span className="font-medium text-foreground">{props.userEmail}</span>. The CLI is requesting{" "}
        <span className="font-mono">{props.scope}</span> access for <span className="font-mono">{props.clientId}</span>.
      </p>

      <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-center">
        <div className="text-xs text-secondary-foreground">Confirmation code</div>
        <div className="mt-1 font-mono text-lg tracking-widest">{props.userCode}</div>
      </div>

      {showFallbackNotice && (
        <p className="text-xs text-warning">
          You do not have access to the project the CLI requested. Pick another project below.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="oauth-device-project">Project</Label>
        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
          <SelectTrigger id="oauth-device-project">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((ws) => (
              <SelectGroup key={ws.id}>
                <SelectLabel>{ws.name}</SelectLabel>
                {ws.projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
            <AddProjectDialog workspaceId={addProjectWorkspaceId} onCreated={handleProjectCreated}>
              <div className="relative mt-1 flex w-full cursor-pointer items-center rounded-sm py-1.5 pl-2 pr-8 text-sm hover:bg-secondary">
                <Plus className="mr-2 h-3 w-3" />
                <span className="text-xs">Add project</span>
              </div>
            </AddProjectDialog>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={() => submitDecision("deny")}
          className="flex-1"
        >
          Deny
        </Button>
        <Button
          type="button"
          disabled={submitting || !selectedProjectId}
          onClick={() => submitDecision("approve")}
          className="flex-1"
        >
          {submitting ? "Working..." : "Authorize"}
        </Button>
      </div>
    </OAuthDevicePanel>
  );
}
