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
  onError: (error: string) => void;
}

type PendingAction = "add-card" | "subscribe" | null;

export default function TrialActions({ workspaceId, trialEnd, hasPaymentMethod, onError }: TrialActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);

  // Card step goes through Stripe setup Checkout; with a card on file "Subscribe now" just ends the trial.
  const openCardSetup = async (endTrialNow: boolean) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/subscription/trial/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnUrl: window.location.href, endTrialNow }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error ?? "Failed to open payment setup");
    }
    const { url } = (await res.json()) as { url: string };
    window.location.href = url;
  };

  const run = async (action: Exclude<PendingAction, null>) => {
    setPending(action);
    try {
      track("billing", action === "add-card" ? "trial_add_card_clicked" : "trial_subscribe_now_clicked");
      if (action === "subscribe" && hasPaymentMethod) {
        const res = await fetch(`/api/workspaces/${workspaceId}/subscription/trial/end`, { method: "POST" });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "Failed to start the subscription");
        }
        router.refresh();
        setPending(null);
        return;
      }
      await openCardSetup(action === "subscribe");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Something went wrong");
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-secondary-foreground">
        {hasPaymentMethod
          ? `Your card is on file. Starter starts on ${formatDate(trialEnd)}.`
          : `Your trial ends on ${formatDate(trialEnd)}. Add a payment method to keep Starter, otherwise the workspace moves to Free.`}
      </p>
      <div className="flex gap-2">
        {!hasPaymentMethod && (
          <Button onClick={() => run("add-card")} disabled={pending !== null}>
            {pending === "add-card" && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
            Add payment method
          </Button>
        )}
        <Button variant="outline" onClick={() => run("subscribe")} disabled={pending !== null}>
          {pending === "subscribe" && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
          Subscribe now
        </Button>
      </div>
    </div>
  );
}
