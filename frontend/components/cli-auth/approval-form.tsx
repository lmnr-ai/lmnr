"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type DeviceApprovalContext, type SessionProject, type SessionWorkspace } from "@/lib/actions/cli-auth";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/lib/hooks/use-toast";

import { ProjectSelect } from "./project-select";
import { Centered, CompletionScreen, UserCodeDisplay } from "./shared";

interface Props {
  userEmail: string;
  rawUserCode: string;
  context: DeviceApprovalContext | null;
  projects: SessionProject[];
  workspaces: SessionWorkspace[];
  claimFailed?: boolean;
}

// Approve is the last step of CLI onboarding. A user with 0 or 1 projects sends
// no projectId at all and the server resolves it (creating `dev` in a workspace
// named after their email domain for a brand-new account); only a user with a
// real choice to make sees the project selector, pre-selected so Approve still
// takes a single click.
export function ApprovalForm({ userEmail, rawUserCode, context, projects, workspaces, claimFailed }: Props) {
  const { toast } = useToast();
  const [options, setOptions] = useState<SessionProject[]>(projects);
  const [selectedId, setSelectedId] = useState<string>(projects.length > 1 ? projects[0].id : "");
  const [approving, setApproving] = useState(false);
  const [denying, setDenying] = useState(false);
  const [completed, setCompleted] = useState<null | "approved" | "denied">(null);

  // Invalid / expired / wrong-status banners.
  let banner: string | null = null;
  if (!context) banner = "We couldn't find that code. Double-check the value in your terminal and try again.";
  else if (new Date(context.expiresAt).getTime() < Date.now())
    banner = "This code has expired. Re-run `lmnr-cli login`.";
  else if (context.status === "approved") banner = "This code has already been approved. Return to your terminal.";
  else if (context.status === "denied") banner = "This code has already been denied. Re-run `lmnr-cli login`.";
  else if (claimFailed)
    banner = "We couldn't verify this code for your account. Re-run `lmnr-cli login` and try again.";

  const busy = approving || denying;

  const onApprove = async () => {
    if (!context) return;
    setApproving(true);
    try {
      const res = await fetch("/api/cli/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No projectId => the server picks/creates the default project.
        body: JSON.stringify({ userCode: context.userCode, ...(selectedId ? { projectId: selectedId } : {}) }),
      });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to authorize device" });
        return;
      }
      setCompleted("approved");
    } catch {
      toast({ variant: "destructive", title: "Something went wrong" });
    } finally {
      setApproving(false);
    }
  };

  const onDeny = async () => {
    if (!context) return;
    setDenying(true);
    try {
      const { error } = await authClient.device.deny({ userCode: context.userCode });
      if (error) {
        toast({ variant: "destructive", title: error.error_description ?? "Failed to deny device" });
        return;
      }
      setCompleted("denied");
    } catch {
      toast({ variant: "destructive", title: "Something went wrong" });
    } finally {
      setDenying(false);
    }
  };

  // New project lands in the dropdown and becomes the selection — it does NOT
  // approve; Approve stays the only authorize trigger.
  const onProjectCreated = (project: SessionProject) => {
    setOptions((prev) => [project, ...prev.filter((p) => p.id !== project.id)]);
    setSelectedId(project.id);
  };

  if (completed) {
    return <CompletionScreen result={completed} />;
  }

  return (
    <Centered>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorize the Laminar CLI</CardTitle>
          <CardDescription>
            Confirm this code matches the one shown in your terminal.
            <span className="block text-xs mt-1 text-muted-foreground/80">Signed in as {userEmail}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {rawUserCode ? <UserCodeDisplay code={rawUserCode} /> : null}
          {banner ? (
            <p className="text-sm text-destructive border border-destructive/30 bg-destructive/10 rounded-md p-3">
              {banner}
            </p>
          ) : (
            <>
              {options.length > 1 ? (
                <ProjectSelect
                  projects={options}
                  workspaces={workspaces}
                  value={selectedId}
                  onChange={setSelectedId}
                  onCreated={onProjectCreated}
                  disabled={busy}
                />
              ) : null}
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onDeny} disabled={busy} className="flex-1">
                  {denying ? "Denying…" : "Deny"}
                </Button>
                <Button type="button" onClick={onApprove} disabled={busy} className="flex-1">
                  {approving ? "Authorizing…" : "Approve"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Centered>
  );
}
