"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { broadcastLogout } from "@/components/auth/session-sync-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut } from "@/lib/auth-client";
import { reset } from "@/lib/posthog";
import { withBasePath } from "@/lib/utils";

// Shown instead of onboarding when Okta groups manage membership and grant this user nothing.
export default function SsoNoWorkspace({ email }: { email: string }) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      reset();
      broadcastLogout();
      window.location.href = withBasePath("/");
    } catch (e) {
      console.error(e);
      setIsSigningOut(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>No workspace access yet</CardTitle>
          <CardDescription className="mt-1">
            Workspace access for {email} is managed through Okta groups, and none of your groups grant a Laminar
            workspace. Ask your Okta admin to add you to one.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild className="flex-1">
            <Link href="/projects">Check again</Link>
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleLogout} disabled={isSigningOut}>
            {isSigningOut && <Loader2 className="animate-spin size-3.5 mr-1" />}
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
