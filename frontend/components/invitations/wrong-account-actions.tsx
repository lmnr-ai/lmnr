"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { broadcastLogout } from "@/components/auth/session-sync-provider";
import { Button } from "@/components/ui/button";
import { deleteLastProjectIdCookie } from "@/lib/actions/project/cookies";
import { deleteLastWorkspaceIdCookie } from "@/lib/actions/workspace/cookies";
import { signOut } from "@/lib/auth-client";
import { reset, track } from "@/lib/posthog";
import { withBasePath } from "@/lib/utils";

interface WrongAccountActionsProps {
  workspaceId: string;
  // This invitation's own URL, handed to sign-in as the post-auth destination.
  invitationUrl: string;
}

const WrongAccountActions = ({ workspaceId, invitationUrl }: WrongAccountActionsProps) => {
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    track("invitations", "wrong_account_viewed", { workspaceId });
  }, [workspaceId]);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      track("invitations", "wrong_account_sign_out", { workspaceId }, { sendInstantly: true });
      await deleteLastWorkspaceIdCookie();
      await deleteLastProjectIdCookie();
      await signOut();
      // Unlink this device from the user so the next sign-in starts from a fresh
      // anonymous id — this flow always ends in a different account.
      reset();
      broadcastLogout();
      // signOut() takes no callbackUrl of its own, so navigate here. A full page
      // load (not router.push) makes the server re-read the now-cleared session.
      window.location.href = withBasePath(`/sign-in?callbackUrl=${encodeURIComponent(invitationUrl)}`);
    } catch (e) {
      console.error(e);
      setIsSigningOut(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 pt-2">
      <div className="flex gap-2 w-full">
        <Button
          asChild
          variant="outline"
          className="flex-1"
          onClick={() => track("invitations", "wrong_account_home", { workspaceId })}
        >
          <Link href="/projects">Go to home</Link>
        </Button>
        <Button className="flex-1" onClick={handleSignOut} disabled={isSigningOut}>
          {isSigningOut && <Loader2 className="animate-spin size-3.5 mr-1" />}
          Sign out and switch
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">
        Signing out brings you back to this invitation once you sign in with the invited email.
      </span>
    </div>
  );
};

export default WrongAccountActions;
