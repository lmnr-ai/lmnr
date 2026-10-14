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

type PendingAction = "add-card" | "subscribe" | "stop" | "keep" | null;

const TRACK_EVENTS: Record<Exclude<PendingAction, null>, string> = {
  "add-card": "trial_add_card_clicked",
  subscribe: "trial_subscribe_now_clicked",
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

  // A URL means Stripe needs a card first; "end" returns null when it used the card on file.
  const postForUrl = async (path: "payment" | "end", fallbackError: string) => {
    const res = await request(
      `${trialUrl}/${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: window.location.href }),
      },
      fallbackError
    );
    return ((await res.json()) as { url: string | null }).url;
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
      let url: string | null = null;
      if (action === "add-card") {
        url = await postForUrl("payment", "Failed to open payment setup");
      } else if (action === "subscribe") {
        url = await postForUrl("end", "Failed to start the subscription");
      } else {
        await setContinues(action === "keep");
      }
      if (url) {
        window.location.href = url;
        return;
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
          Your trial ends on {endsOn} and won{"'"}t continue. The workspace moves to Free and nothing is charged.
        </p>
        <div className="flex gap-2">{button("keep", "Keep Starter")}</div>
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
        {!hasPaymentMethod && button("add-card", "Add payment method")}
        {button("subscribe", "Subscribe now", "outline")}
        {hasPaymentMethod && button("stop", "Cancel trial", "ghost")}
      </div>
    </div>
  );
}
