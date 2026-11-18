"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/lib/hooks/use-toast";

import { SCOPE_DESCRIPTIONS } from "./scopes";

interface Props {
  clientName: string;
  redirectHost: string;
  scopes: string[];
  userEmail: string;
}

export const OAuthConsent = ({ clientName, redirectHost, scopes, userEmail }: Props) => {
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
        <CardHeader>
          <CardTitle>Authorize {clientName}</CardTitle>
          <CardDescription>
            {clientName} wants to access your Laminar account. Once approved, it can act on your Laminar projects via
            MCP with the same access you have.
            <span className="block text-xs mt-1 text-muted-foreground/80">Signed in as {userEmail}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {scopes.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm list-disc pl-5">
              {scopes.map((scope) => (
                <li key={scope}>{SCOPE_DESCRIPTIONS[scope] ?? scope}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground">
            You&apos;ll be sent back to <span className="font-mono">{redirectHost}</span>. Only approve apps you trust.
          </p>
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
