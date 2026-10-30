"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { type ReactNode, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { type PaidTier, TRIAL_UPGRADE_PARAM } from "@/lib/actions/checkout/types";
import { track } from "@/lib/posthog";

interface SwitchTierDialogProps {
  children: ReactNode;
  workspaceId: string;
  fromTier: PaidTier;
  targetTier: PaidTier;
  action: "upgrade" | "downgrade";
  currentTierName: string;
  targetTierName: string;
  targetTierPrice: string;
  targetTierPriceSubtext: string;
  // Trial without a card: confirming opens Stripe to add one, and the return reopens this dialog.
  needsPaymentMethod: boolean;
  onError: (error: string) => void;
}

export default function SwitchTierDialog({
  children,
  workspaceId,
  fromTier,
  targetTier,
  action,
  currentTierName,
  targetTierName,
  targetTierPrice,
  targetTierPriceSubtext,
  needsPaymentMethod,
  onError,
}: SwitchTierDialogProps) {
  const router = useRouter();
  const [upgradeParam, setUpgradeParam] = useQueryState(TRIAL_UPGRADE_PARAM);
  // Back from adding a card for this upgrade: reopen it so the user confirms the charge.
  const [open, setOpen] = useState(upgradeParam === targetTier && !needsPaymentMethod);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && upgradeParam) void setUpgradeParam(null);
  };
  const [isSwitching, startSwitchTransition] = useTransition();

  const isUpgrade = action === "upgrade";

  const handleSwitch = () => {
    startSwitchTransition(async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/subscription/${needsPaymentMethod ? "trial/payment" : "switch-tier"}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tier: targetTier, returnUrl: window.location.href }),
          }
        );
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Failed to switch tier");
        }
        if (needsPaymentMethod) {
          window.location.href = ((await res.json()) as { url: string }).url;
          return;
        }
        // sendInstantly bypasses posthog-js's batching queue — router.refresh()
        // below triggers a full RSC re-render that can drop queued events.
        track(
          "billing",
          action === "upgrade" ? "upgrade_confirmed" : "downgrade_confirmed",
          { from_tier: fromTier, to_tier: targetTier },
          { sendInstantly: true }
        );
        handleOpenChange(false);
        router.refresh();
      } catch (e: any) {
        onError(e.message ?? "Failed to switch tier");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isUpgrade ? "Upgrade" : "Downgrade"} to {targetTierName}
          </DialogTitle>
          <DialogDescription>Please review the billing details for this plan change.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-secondary-foreground">
          <p>
            You will be {isUpgrade ? "upgraded" : "downgraded"} from{" "}
            <span className="font-medium text-foreground">{currentTierName}</span> to{" "}
            <span className="font-medium text-foreground">
              {targetTierName} ({targetTierPrice}
              {targetTierPriceSubtext})
            </span>{" "}
            immediately.{" "}
            {isUpgrade ? (
              <>
                Your current plan will be pro-rated and refunded, and{" "}
                <span className="underline">
                  the new plan will be charged right away for the remainder of the billing cycle.
                </span>
              </>
            ) : (
              <>
                The remaining value of your current plan will be pro-rated and{" "}
                <span className="underline">credited to your balance</span>, which will be applied to future charges.
                The new plan will be charged right away for the remainder of the billing cycle.
              </>
            )}
          </p>
          {needsPaymentMethod && <p>You will add a payment method first, then confirm the upgrade here.</p>}
          <p>Any usage-based charges accrued this cycle will be billed at the end of the cycle.</p>
          {!isUpgrade && (
            <p className="text-xs text-muted-foreground">
              Some features and limits may no longer be available after downgrading.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSwitching}>
            Keep current plan
          </Button>
          <Button variant={isUpgrade ? "default" : "destructive"} disabled={isSwitching} onClick={handleSwitch}>
            {isSwitching && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
            {needsPaymentMethod ? "Add payment method" : isUpgrade ? "Upgrade" : "Downgrade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
