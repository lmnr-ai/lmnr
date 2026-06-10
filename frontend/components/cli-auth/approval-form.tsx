"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type DeviceApprovalContext, type SessionProject, type SessionWorkspace } from "@/lib/actions/cli-auth";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/lib/hooks/use-toast";

import { Centered, CompletionScreen, UserCodeDisplay } from "./index";
import { ProjectPicker } from "./project-picker";

interface Props {
  userEmail: string;
  rawUserCode: string;
  context: DeviceApprovalContext | null;
  projects: SessionProject[];
  workspaces: SessionWorkspace[];
  claimFailed?: boolean;
}

export function ApprovalForm({ userEmail, rawUserCode, context, projects, workspaces, claimFailed }: Props) {
  const { toast } = useToast();
  const [denying, setDenying] = useState(false);
  const [step, setStep] = useState<"approve" | "pick-project">("approve");
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

  if (completed) {
    return <CompletionScreen result={completed} />;
  }

  // Step 2 — project picker. The row is approved (with the chosen project written
  // into its metadata) only once a project is selected/created inside the picker.
  if (step === "pick-project" && context) {
    return (
      <ProjectPicker
        userCode={context.userCode}
        projects={projects}
        workspaces={workspaces}
        onApproved={() => setCompleted("approved")}
        onDenied={() => setCompleted("denied")}
      />
    );
  }

  // Deny is terminal and does not need a project.
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
              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={onDeny} disabled={denying} className="flex-1">
                  {denying ? "Denying…" : "Deny"}
                </Button>
                {/* Approve advances to the picker — the row is NOT approved yet. */}
                <Button type="button" onClick={() => setStep("pick-project")} disabled={denying} className="flex-1">
                  Approve
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Centered>
  );
}
