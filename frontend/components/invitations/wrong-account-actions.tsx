"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { broadcastLogout } from "@/components/auth/session-sync-provider";
import { deleteLastProjectIdCookie } from "@/lib/actions/project/cookies";
import { deleteLastWorkspaceIdCookie } from "@/lib/actions/workspace/cookies";
import { signOut } from "@/lib/auth-client";
import { reset, track } from "@/lib/posthog";
import { withBasePath } from "@/lib/utils";

import { primaryAction, secondaryAction } from "./class-names";

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
    <div className="flex w-full gap-3">
      <Link
        href="/projects"
        className={secondaryAction}
        onClick={() => track("invitations", "wrong_account_home", { workspaceId })}
      >
        Go to home
      </Link>
      <button type="button" className={primaryAction} onClick={handleSignOut} disabled={isSigningOut}>
        {isSigningOut && <Loader2 className="size-3.5 animate-spin" />}
        Switch account
      </button>
    </div>
  );
};

export default WrongAccountActions;
