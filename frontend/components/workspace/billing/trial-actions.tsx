"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/components/workspace/billing/utils";
import { track } from "@/lib/posthog";

interface TrialActionsProps {
  workspaceId: string;
  trialEnd: number;
  hasPaymentMethod: boolean;
  cancelAtPeriodEnd: boolean;
  onError: (error: string) => void;
}

type PendingAction = "add-card" | "start" | "stop" | "keep" | null;

const TRACK_EVENTS: Record<Exclude<PendingAction, null>, string> = {
  "add-card": "trial_add_card_clicked",
  start: "trial_start_now_clicked",
  stop: "trial_stop_clicked",
  keep: "trial_keep_clicked",
};

const request = async (url: string, init: RequestInit, fallbackError: string) => {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? fallbackError);
  }
  return res;
};

export default function TrialActions({
  workspaceId,
  trialEnd,
  hasPaymentMethod,
  cancelAtPeriodEnd,
  onError,
}: TrialActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);
  const trialUrl = `/api/workspaces/${workspaceId}/subscription/trial`;

  const openCardSetup = async () => {
    const res = await request(
      `${trialUrl}/payment`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: window.location.href }),
      },
      "Failed to open payment setup"
    );
    window.location.href = ((await res.json()) as { url: string }).url;
  };

  const setContinues = (continues: boolean) =>
    request(
      trialUrl,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ continues }) },
      "Failed to update the trial"
    );

  const run = async (action: Exclude<PendingAction, null>) => {
    setPending(action);
    try {
      track("billing", TRACK_EVENTS[action]);
      if (action === "add-card") {
        await openCardSetup();
        return;
      }
      if (action === "start") {
        await request(`${trialUrl}/end`, { method: "POST" }, "Failed to start Starter");
      } else {
        await setContinues(action === "keep");
      }
      router.refresh();
      setPending(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong");
      setPending(null);
    }
  };

  const button = (action: Exclude<PendingAction, null>, label: string, variant?: "outline" | "ghost") => (
    <Button variant={variant} onClick={() => run(action)} disabled={pending !== null}>
      {pending === action && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
      {label}
    </Button>
  );

  const endsOn = formatDate(trialEnd);

  if (cancelAtPeriodEnd) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-secondary-foreground">
          Subscription cancelled. Your trial runs until {endsOn}, then the workspace moves to Free. Nothing is charged.
        </p>
        <div className="flex gap-2">{button("keep", "Keep subscription")}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-secondary-foreground">
        {hasPaymentMethod
          ? `Your card is on file. Starter starts on ${endsOn}.`
          : `Your trial ends on ${endsOn}. Add a payment method to keep Starter, otherwise the workspace moves to Free.`}
      </p>
      <div className="flex gap-2">
        {hasPaymentMethod ? (
          <>
            {button("start", "Start now", "outline")}
            {button("stop", "Cancel subscription", "ghost")}
          </>
        ) : (
          button("add-card", "Add payment method")
        )}
      </div>
    </div>
  );
}
