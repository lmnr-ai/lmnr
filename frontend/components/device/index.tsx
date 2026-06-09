"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type DeviceApprovalContext, type SessionProject, type SessionWorkspace } from "@/lib/actions/device";

import { ApprovalForm } from "./approval-form";

interface Props {
  userEmail: string;
  mode: "enter-code" | "approve";
  rawUserCode?: string;
  context?: DeviceApprovalContext | null;
  projects?: SessionProject[];
  workspaces?: SessionWorkspace[];
}

export default function DeviceApproval({ userEmail, mode, rawUserCode, context, projects, workspaces }: Props) {
  if (mode === "enter-code") {
    return <CodeEntryForm userEmail={userEmail} />;
  }
  return (
    <ApprovalForm
      userEmail={userEmail}
      rawUserCode={rawUserCode ?? ""}
      context={context ?? null}
      projects={projects ?? []}
      workspaces={workspaces ?? []}
    />
  );
}

function CodeEntryForm({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = code.trim();
    if (cleaned.length === 0) return;
    router.push(`/device?user_code=${encodeURIComponent(cleaned)}`);
  };
  return (
    <Centered>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Authorize a device</CardTitle>
          <CardDescription>
            Enter the code shown by the Laminar CLI to authorize this device for {userEmail}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Input
              autoFocus
              placeholder="e.g. ABCD-EFGH"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center font-mono tracking-widest"
            />
            <Button type="submit" disabled={code.trim().length === 0}>
              Continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </Centered>
  );
}

export function CompletionScreen({ result }: { result: "approved" | "denied" }) {
  return (
    <Centered>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{result === "approved" ? "Authorized" : "Denied"}</CardTitle>
          <CardDescription>
            {result === "approved"
              ? "You can close this tab and return to your terminal."
              : "Return to your terminal and re-run `lmnr-cli login` if you want to retry."}
          </CardDescription>
        </CardHeader>
      </Card>
    </Centered>
  );
}

// Subtle single-box code display.
export function UserCodeDisplay({ code }: { code: string }) {
  return (
    <div className="w-full select-all rounded-md border bg-muted px-4 py-2 text-center font-mono text-lg tracking-[0.2em] text-foreground">
      {code}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">{children}</div>;
}
