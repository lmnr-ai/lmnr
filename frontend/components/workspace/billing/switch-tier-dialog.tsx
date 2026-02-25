"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { type PaidTier } from "@/lib/actions/checkout/types";

interface SwitchTierDialogProps {
  children: ReactNode;
  workspaceId: string;
  targetTier: PaidTier;
  action: "upgrade" | "downgrade";
  currentTierName: string;
  targetTierName: string;
  targetTierPrice: string;
  targetTierPriceSubtext: string;
  onError: (error: string) => void;
}

export default function SwitchTierDialog({
  children,
  workspaceId,
  targetTier,
  action,
  currentTierName,
  targetTierName,
  targetTierPrice,
  targetTierPriceSubtext,
  onError,
}: SwitchTierDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSwitching, startSwitchTransition] = useTransition();

  const isUpgrade = action === "upgrade";

  const handleSwitch = () => {
    startSwitchTransition(async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/subscription/switch-tier`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: targetTier }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Failed to switch tier");
        }
        setOpen(false);
        router.refresh();
      } catch (e: any) {
        onError(e.message ?? "Failed to switch tier");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <p>
            Usage-based charges (data and signal runs) will be billed at the end of the cycle based on your active plan
            at that time.
          </p>
          {!isUpgrade && (
            <p className="text-xs text-muted-foreground">
              Some features and limits may no longer be available after downgrading.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isSwitching}>
            Keep current plan
          </Button>
          <Button variant={isUpgrade ? "default" : "destructive"} disabled={isSwitching} onClick={handleSwitch}>
            {isSwitching && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
            {isUpgrade ? "Upgrade" : "Downgrade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
