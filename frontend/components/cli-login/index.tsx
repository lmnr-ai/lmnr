"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

interface ProjectOption {
  id: string;
  name: string;
}

interface WorkspaceOption {
  id: string;
  name: string;
  projects: ProjectOption[];
}

interface CliLoginClientProps {
  sessionId: string;
  publicKey: string;
  user: { id: string; email: string; name: string };
  workspaces: WorkspaceOption[];
}

interface SuccessInfo {
  projectName: string;
  workspaceName: string;
  shorthand: string;
}

export default function CliLoginClient({ sessionId, publicKey, user, workspaces }: CliLoginClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Initial defaults: first workspace + its first project (covers the
  // single-workspace single-project autoselect case for free).
  const [workspaceId, setWorkspaceId] = useState<string | null>(workspaces[0]?.id ?? null);
  const [rawProjectId, setRawProjectId] = useState<string | null>(workspaces[0]?.projects[0]?.id ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === workspaceId) ?? null,
    [workspaces, workspaceId]
  );

  // Derive effective projectId on every render so changing the workspace
  // does not require a useEffect to reconcile. If the explicitly-selected
  // project no longer belongs to the current workspace, fall back to that
  // workspace's first project.
  const projectId = useMemo(() => {
    if (!selectedWorkspace) return null;
    if (rawProjectId && selectedWorkspace.projects.some((p) => p.id === rawProjectId)) {
      return rawProjectId;
    }
    return selectedWorkspace.projects[0]?.id ?? null;
  }, [selectedWorkspace, rawProjectId]);

  const handleWorkspaceChange = (next: string) => {
    setWorkspaceId(next);
    // Reset explicit selection so the derivation above picks the new
    // workspace's first project until the user picks something else.
    setRawProjectId(null);
  };

  const handleApprove = async () => {
    if (!projectId || !workspaceId) return;
    setIsSubmitting(true);
    try {
      track("auth", "cli_approve_clicked", { projectId });
      const res = await fetch(`/api/projects/${projectId}/cli-grants/${sessionId}/approve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message = data?.error ?? "Approval failed";
        toast({ variant: "destructive", title: message });
        setIsSubmitting(false);
        return;
      }
      const data = (await res.json()) as { projectName: string; workspaceName: string; shorthand: string };
      track("auth", "cli_approved", { projectId });
      setSuccess({ projectName: data.projectName, workspaceName: data.workspaceName, shorthand: data.shorthand });
    } catch {
      toast({ variant: "destructive", title: "Network error. Please try again." });
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push("/projects");
  };

  if (success) {
    return (
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>You're all set</CardTitle>
          <CardDescription>
            Return to your terminal — the CLI should pick this up within a couple of seconds.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Project: </span>
            <span className="font-medium">{success.projectName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Workspace: </span>
            <span className="font-medium">{success.workspaceName}</span>
          </div>
          <div>
            <span className="text-muted-foreground">API key prefix: </span>
            <span className="font-mono">{success.shorthand}</span>
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            You can revoke this key any time from project settings &rarr; API keys.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => router.push("/projects")}>
            Close
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const hasNoWorkspace = workspaces.length === 0;
  const hasNoProject = selectedWorkspace && selectedWorkspace.projects.length === 0;

  return (
    <Card className="max-w-md w-full">
      <CardHeader>
        <CardTitle>Authorize Laminar CLI</CardTitle>
        <CardDescription>
          Signed in as <span className="font-medium">{user.email}</span>. Choose the project the CLI should access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasNoWorkspace ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">You don't belong to any workspaces yet.</p>
            <Link href="/onboarding">
              <Button variant="outline">Create a workspace</Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Workspace</label>
              <Select value={workspaceId ?? undefined} onValueChange={handleWorkspaceChange}>
                <SelectTrigger>
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
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Project</label>
              <Select value={projectId ?? undefined} onValueChange={(v) => setRawProjectId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {(selectedWorkspace?.projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasNoProject ? (
                <p className="pt-2 text-xs text-muted-foreground">
                  This workspace has no projects.{" "}
                  <Link href="/projects" className="underline">
                    Create one
                  </Link>{" "}
                  first.
                </p>
              ) : null}
            </div>
          </>
        )}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Show CLI session details</summary>
          <div className="pt-2 space-y-1 font-mono break-all">
            <div>session_id: {sessionId}</div>
            <div>public_key: {publicKey.slice(0, 24)}...</div>
          </div>
        </details>
      </CardContent>
      <CardFooter className="gap-2">
        <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleApprove} disabled={!projectId || isSubmitting || hasNoWorkspace || !!hasNoProject}>
          {isSubmitting ? "Authorizing..." : "Authorize"}
        </Button>
      </CardFooter>
    </Card>
  );
}
