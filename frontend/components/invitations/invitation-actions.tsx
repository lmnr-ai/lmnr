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
    <div className="flex gap-2 w-full pt-2">
      <form action={handleDecline} className="flex-1">
        <Button type="submit" variant="outline" className="w-full">
          Decline
        </Button>
      </form>
      <form action={handleAccept} className="flex-1">
        <Button type="submit" className="w-full">
          Accept
        </Button>
      </form>
    </div>
  );
}
