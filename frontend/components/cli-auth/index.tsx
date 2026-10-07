"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type DeviceApprovalContext, type SessionProject, type SessionWorkspace } from "@/lib/actions/cli-auth";

import { ApprovalForm } from "./approval-form";
import { Centered } from "./shared";

interface Props {
  userEmail: string;
  mode: "enter-code" | "approve";
  rawUserCode?: string;
  context?: DeviceApprovalContext | null;
  projects?: SessionProject[];
  workspaces?: SessionWorkspace[];
  claimFailed?: boolean;
}

export default function DeviceApproval({
  userEmail,
  mode,
  rawUserCode,
  context,
  projects,
  workspaces,
  claimFailed,
}: Props) {
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
      claimFailed={claimFailed ?? false}
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
