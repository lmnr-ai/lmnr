"use client";

import { useState } from "react";

import { Centered } from "@/components/cli-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { useToast } from "@/lib/hooks/use-toast";

interface OAuthConsentProps {
  clientName: string;
  oauthQuery: string;
  requestedScopes: string[];
  userEmail: string;
}

const SCOPE_LABELS: Record<string, string> = {
  "mcp:read": "Read trace and span data from Laminar projects you can access",
  offline_access: "Stay connected after this browser session ends",
  profile: "See your Laminar profile",
  email: "See your email address",
  openid: "Confirm your Laminar identity",
};

export function OAuthConsent({ clientName, oauthQuery, requestedScopes, userEmail }: OAuthConsentProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState<"allow" | "deny" | null>(null);

  const submit = async (accept: boolean) => {
    setSubmitting(accept ? "allow" : "deny");
    try {
      const { data, error } = await authClient.oauth2.consent({
        accept,
        scope: requestedScopes.join(" "),
        oauth_query: oauthQuery,
      });
      if (error) {
        toast({ variant: "destructive", title: error.message ?? "Authorization failed" });
        return;
      }
      if (data?.url) window.location.assign(data.url);
    } catch {
      toast({ variant: "destructive", title: "Authorization failed" });
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Centered>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Authorize {clientName}</CardTitle>
          <CardDescription>
            This agent will act as {userEmail}. It can only access Laminar projects that you can access.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="rounded-md border bg-muted/40 p-4">
            <p className="mb-3 text-sm font-medium">This connection can:</p>
            <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
              {requestedScopes.map((scope) => (
                <li key={scope}>{SCOPE_LABELS[scope] ?? scope}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            Project membership is checked again on every tool call. Disconnect the integration in the agent to revoke
            its stored grant.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={submitting !== null}
              onClick={() => submit(false)}
            >
              {submitting === "deny" ? "Denying…" : "Deny"}
            </Button>
            <Button type="button" className="flex-1" disabled={submitting !== null} onClick={() => submit(true)}>
              {submitting === "allow" ? "Authorizing…" : "Authorize"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </Centered>
  );
}
