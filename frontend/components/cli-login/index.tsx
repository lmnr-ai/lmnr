"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";

import { AddProjectDialog, type CreatedProject } from "@/components/cli-login/add-project-dialog";
import { BootstrapForm } from "@/components/cli-login/bootstrap-form";
import { ManualKeyPanel } from "@/components/cli-login/manual-key-panel";
import { CliLoginPanel } from "@/components/cli-login/panel";
import { Button } from "@/components/ui/button";
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
import { track } from "@/lib/posthog";
import { type AccessibleWorkspace } from "@/lib/workspaces/types";

interface CliLoginClientProps {
  userEmail: string;
  workspaces: AccessibleWorkspace[];
  port: string | null;
  state: string | null;
  codeChallenge: string | null;
  manual: boolean;
}

export default function CliLoginClient(props: CliLoginClientProps) {
  const { toast } = useToast();
  const [workspaces, setWorkspaces] = useState<AccessibleWorkspace[]>(props.workspaces);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [manualKey, setManualKey] = useState<{ apiKey: string; projectName: string } | null>(null);

  const flatProjects = useMemo(
    () => workspaces.flatMap((w) => w.projects.map((p) => ({ ...p, workspaceId: w.id }))),
    [workspaces]
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string>(flatProjects[0]?.id ?? "");

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

  async function approve() {
    if (!selectedProjectId) return;
    setSubmitting(true);
    try {
      track("auth", "cli_approve_clicked", { projectId: selectedProjectId });
      const res = await fetch("/api/cli-login/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          props.manual
            ? { projectId: selectedProjectId, manual: true }
            : { projectId: selectedProjectId, codeChallenge: props.codeChallenge }
        ),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({ variant: "destructive", title: err?.error ?? "Authorization failed" });
        return;
      }
      const data = (await res.json()) as { code?: string; apiKey?: string; projectName: string };
      track("auth", "cli_approved", { projectId: selectedProjectId });
      if (props.manual) {
        setManualKey({ apiKey: data.apiKey ?? "", projectName: data.projectName });
        return;
      }
      // PKCE: hand the code back to the CLI's loopback server via top-level
      // navigation (CORS / secure-context forbid fetch to 127.0.0.1).
      setDone(true);
      window.location.replace(
        `http://127.0.0.1:${props.port}/callback?code=${encodeURIComponent(data.code ?? "")}&state=${encodeURIComponent(
          props.state ?? ""
        )}`
      );
    } catch {
      toast({ variant: "destructive", title: "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (manualKey) {
    return <ManualKeyPanel apiKey={manualKey.apiKey} projectName={manualKey.projectName} />;
  }

  if (done) {
    return (
      <CliLoginPanel title="All set">
        <p className="text-sm text-secondary-foreground">
          You can return to your terminal — the CLI will finish setup.
        </p>
      </CliLoginPanel>
    );
  }

  if (flatProjects.length === 0) {
    return <BootstrapForm userEmail={props.userEmail} onCreated={(ws) => setWorkspaces([ws])} />;
  }

  return (
    <CliLoginPanel title="Authorize Laminar CLI">
      <p className="text-sm text-secondary-foreground">
        Signed in as <span className="font-medium text-foreground">{props.userEmail}</span>. Choose the project the CLI
        should access.
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="cli-login-project">Project</Label>
        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
          <SelectTrigger id="cli-login-project">
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
      <Button type="button" disabled={submitting || !selectedProjectId} onClick={approve}>
        {submitting ? "Working..." : "Authorize"}
      </Button>
    </CliLoginPanel>
  );
}
