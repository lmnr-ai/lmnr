"use client";

import { useMemo, useState } from "react";

import { OAuthDevicePanel } from "@/components/oauth-device/panel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/use-toast";
import { type AccessibleWorkspace } from "@/lib/oauth/user-access";

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
  const { workspaces, requestedProjectId, requestedProjectAccessible } = props;
  const { toast } = useToast();

  const flatProjects = useMemo(
    () => workspaces.flatMap((w) => w.projects.map((p) => ({ ...p, workspaceName: w.name, workspaceId: w.id }))),
    [workspaces]
  );

  const initialProjectId =
    requestedProjectId && requestedProjectAccessible ? requestedProjectId : (flatProjects[0]?.id ?? "");

  const [stage, setStage] = useState<Stage>("review");
  const [submitting, setSubmitting] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId);

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
      <OAuthDevicePanel title="No projects available">
        <p className="text-sm text-secondary-foreground">
          Your account is not a member of any project yet. Create one first, then run the CLI command again.
        </p>
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
        <label className="text-sm font-medium" htmlFor="oauth-device-project">
          Project
        </label>
        <select
          id="oauth-device-project"
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          {workspaces.map((ws) => (
            <optgroup key={ws.id} label={ws.name}>
              {ws.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
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
