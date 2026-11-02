"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { broadcastLogout } from "@/components/auth/session-sync-provider";
import { Button } from "@/components/ui/button";
import { deleteLastProjectIdCookie } from "@/lib/actions/project/cookies";
import { deleteLastWorkspaceIdCookie } from "@/lib/actions/workspace/cookies";
import { signOut } from "@/lib/auth-client";
import { reset } from "@/lib/posthog";
import { withBasePath } from "@/lib/utils";

export default function TrialEndedActions({ hasOpenWorkspace }: { hasOpenWorkspace: boolean }) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async () => {
    try {
      setIsSigningOut(true);
      await deleteLastWorkspaceIdCookie();
      await deleteLastProjectIdCookie();
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
    <div className="flex gap-2 w-full">
      <Button asChild className="flex-1">
        {hasOpenWorkspace ? (
          <Link href="/projects">Go to my workspaces</Link>
        ) : (
          <Link href="/onboarding">Create a workspace</Link>
        )}
      </Button>
      <Button variant="outline" className="flex-1" onClick={handleLogout} disabled={isSigningOut}>
        {isSigningOut && <Loader2 className="animate-spin size-3.5 mr-1" />}
        Log out
      </Button>
    </div>
  );
}
