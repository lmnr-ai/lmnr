"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { track } from "@/lib/posthog";

import { primaryAction, secondaryAction } from "./class-names";

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
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"accept" | "decline" | null>(null);

  useEffect(() => {
    track("invitations", "page_viewed", { workspaceId });
  }, [workspaceId]);

  const handleAccept = () => {
    track("invitations", "accepted", { workspaceId });
    setPendingAction("accept");
    startTransition(acceptInvitation);
  };

  const handleDecline = () => {
    track("invitations", "declined", { workspaceId });
    setPendingAction("decline");
    startTransition(declineInvitation);
  };

  return (
    <div className="flex w-full gap-3">
      <button type="button" className={secondaryAction} onClick={handleDecline} disabled={isPending}>
        {isPending && pendingAction === "decline" && <Loader2 className="size-3.5 animate-spin" />}
        Decline
      </button>
      <button type="button" className={primaryAction} onClick={handleAccept} disabled={isPending}>
        {isPending && pendingAction === "accept" && <Loader2 className="size-3.5 animate-spin" />}
        Accept invitation
      </button>
    </div>
  );
}
