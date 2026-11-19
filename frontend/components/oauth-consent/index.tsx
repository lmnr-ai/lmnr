"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/lib/hooks/use-toast";

interface Props {
  clientName: string;
  redirectHost: string;
  userEmail: string;
}

export const OAuthConsent = ({ clientName, redirectHost, userEmail }: Props) => {
  const { toast } = useToast();
  const [pending, setPending] = useState<null | "approve" | "deny">(null);

  // oauthProviderClient sends the signed request from this page's URL; on success the
  // auth client navigates to the returned url (the app's redirect_uri).
  const decide = async (accept: boolean) => {
    setPending(accept ? "approve" : "deny");
    try {
      const { error } = await authClient.oauth2.consent({ accept });
      if (error) {
        toast({ variant: "destructive", title: error.message || "Failed to submit your decision" });
        setPending(null);
      }
    } catch {
      toast({ variant: "destructive", title: "Something went wrong" });
      setPending(null);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="gap-2 space-y-0">
          <CardTitle>Authorize {clientName}</CardTitle>
          <p className="text-xs text-muted-foreground">Signed in as {userEmail}</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 text-sm text-foreground-200">
            <p>
              {clientName} wants to access your Laminar account. Once approved, it can act on your Laminar projects via
              MCP with the same access you have.
            </p>
            <p>
              You&apos;ll be sent back to <span className="font-mono text-foreground-100">{redirectHost}</span>.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => decide(false)}
              disabled={pending !== null}
              className="flex-1"
            >
              {pending === "deny" ? "Denying…" : "Deny"}
            </Button>
            <Button type="button" onClick={() => decide(true)} disabled={pending !== null} className="flex-1">
              {pending === "approve" ? "Authorizing…" : "Approve"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
