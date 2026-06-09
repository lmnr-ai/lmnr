"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type DeviceApprovalContext } from "@/lib/actions/device";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/lib/hooks/use-toast";

interface Props {
  userEmail: string;
  mode: "enter-code" | "approve";
  rawUserCode?: string;
  context?: DeviceApprovalContext | null;
}

export default function DeviceApproval({ userEmail, mode, rawUserCode, context }: Props) {
  if (mode === "enter-code") {
    return <CodeEntryForm userEmail={userEmail} />;
  }
  return <ApprovalForm userEmail={userEmail} rawUserCode={rawUserCode ?? ""} context={context ?? null} />;
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

function ApprovalForm({
  userEmail,
  rawUserCode,
  context,
}: {
  userEmail: string;
  rawUserCode: string;
  context: DeviceApprovalContext | null;
}) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState<null | "approve" | "deny">(null);
  const [completed, setCompleted] = useState<null | "approved" | "denied">(null);

  const clientId = context?.clientId ?? "lmnr-cli";
  const scope = useMemo(() => {
    if (!context?.scope) return "projects:rw";
    return context.scope;
  }, [context?.scope]);

  // Invalid / expired / wrong-status banners.
  let banner: string | null = null;
  if (!context) banner = "We couldn't find that code. Double-check the value in your terminal and try again.";
  else if (new Date(context.expiresAt).getTime() < Date.now())
    banner = "This code has expired. Re-run `lmnr-cli login`.";
  else if (context.status === "approved") banner = "This code has already been approved. Return to your terminal.";
  else if (context.status === "denied") banner = "This code has already been denied. Re-run `lmnr-cli login`.";

  if (completed) {
    return <CompletionScreen result={completed} />;
  }

  const submit = async (kind: "approve" | "deny") => {
    if (!context) return;
    setSubmitting(kind);
    try {
      if (kind === "approve") {
        const { error } = await authClient.device.approve({ userCode: context.userCode });
        if (error) {
          toast({ variant: "destructive", title: error.error_description ?? "Failed to approve device" });
          return;
        }
        setCompleted("approved");
      } else {
        const { error } = await authClient.device.deny({ userCode: context.userCode });
        if (error) {
          toast({ variant: "destructive", title: error.error_description ?? "Failed to deny device" });
          return;
        }
        setCompleted("denied");
      }
    } catch {
      toast({ variant: "destructive", title: "Something went wrong" });
    } finally {
      setSubmitting(null);
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
              <Field label="Client">
                <span className="font-mono text-sm">{clientId}</span>
              </Field>
              <Field label="Scope">
                <span className="font-mono text-sm">{scope}</span>
              </Field>
              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => submit("deny")}
                  disabled={submitting !== null}
                  className="flex-1"
                >
                  {submitting === "deny" ? "Denying…" : "Deny"}
                </Button>
                <Button
                  type="button"
                  onClick={() => submit("approve")}
                  disabled={submitting !== null}
                  className="flex-1"
                >
                  {submitting === "approve" ? "Approving…" : "Approve"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Centered>
  );
}

function CompletionScreen({ result }: { result: "approved" | "denied" }) {
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
function UserCodeDisplay({ code }: { code: string }) {
  return (
    <div className="w-full select-all rounded-md border bg-muted px-4 py-2 text-center font-mono text-lg tracking-[0.2em] text-foreground">
      {code}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">{children}</div>;
}
