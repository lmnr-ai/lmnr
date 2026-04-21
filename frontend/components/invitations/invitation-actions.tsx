"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { track } from "@/lib/posthog";

interface InvitationActionsProps {
  workspaceId: string;
  acceptInvitation: () => Promise<void>;
  declineInvitation: () => Promise<void>;
}

export default function InvitationActions({
  workspaceId,
  acceptInvitation,
  declineInvitation,
}: InvitationActionsProps) {
  useEffect(() => {
    track("invitations", "page_viewed", { workspaceId });
  }, [workspaceId]);

  const handleAccept = async () => {
    track("invitations", "accepted", { workspaceId });
    await acceptInvitation();
  };

  const handleDecline = async () => {
    track("invitations", "declined", { workspaceId });
    await declineInvitation();
  };

  return (
    <div className="flex gap-4 w-full justify-center mt-6">
      <form action={handleAccept}>
        <Button type="submit">Accept</Button>
      </form>
      <form action={handleDecline}>
        <Button type="submit" variant="outline">
          Decline
        </Button>
      </form>
    </div>
  );
}
