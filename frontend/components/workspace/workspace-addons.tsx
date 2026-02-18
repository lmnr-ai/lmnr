"use client";

import { Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { addAddon, removeAddon } from "@/lib/checkout/actions";
import { ADDON_CONFIG } from "@/lib/checkout/constants";
import { cn } from "@/lib/utils";

interface WorkspaceAddonsProps {
  workspaceId: string;
  currentTierKey: string;
  activeAddonSlugs: string[];
  isOwner: boolean;
  hasActiveSubscription: boolean;
  onError: (message: string) => void;
}

function formatPrice(dollars: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(dollars);
}

export default function WorkspaceAddons({
  workspaceId,
  currentTierKey,
  activeAddonSlugs,
  isOwner,
  hasActiveSubscription,
  onError,
}: WorkspaceAddonsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ lookupKey: string; action: "add" | "remove" } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const eligibleAddons = Object.entries(ADDON_CONFIG).filter(([, cfg]) => cfg.eligibleTiers.includes(currentTierKey));

  if (eligibleAddons.length === 0) return null;

  const handleConfirm = () => {
    if (!dialog) return;
    const { lookupKey, action } = dialog;
    setDialog(null);
    setPendingKey(lookupKey);
    startTransition(async () => {
      try {
        if (action === "add") {
          await addAddon(workspaceId, lookupKey);
        } else {
          await removeAddon(workspaceId, lookupKey);
        }
        router.refresh();
      } catch (e: any) {
        onError(e.message ?? `Failed to ${action} addon`);
      } finally {
        setPendingKey(null);
      }
    });
  };

  const pendingCfg = dialog ? ADDON_CONFIG[dialog.lookupKey] : null;
  const pendingPrice = pendingCfg?.costs[currentTierKey];
  const pendingPriceFormatted = pendingPrice !== undefined ? formatPrice(pendingPrice) : null;
  const isAdding = dialog?.action === "add";

  return (
    <>
      <SettingsSection>
        <SettingsSectionHeader
          size="sm"
          title="Add-ons"
          description="Enhance your workspace with additional features"
        />
        <div className="flex flex-col gap-3 max-w-lg">
          {eligibleAddons.map(([lookupKey, cfg]) => {
            const isActive = activeAddonSlugs.includes(cfg.slug);
            const price = cfg.costs[currentTierKey];
            const priceFormatted = price !== undefined ? formatPrice(price) : null;
            const isThisPending = isPending && pendingKey === lookupKey;

            return (
              <div
                key={lookupKey}
                className={cn(
                  "flex items-center justify-between border rounded-md p-4 gap-4",
                  isActive && "border-green-500/30 bg-green-500/5"
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{cfg.name}</p>
                    {isActive && (
                      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                        <Check className="h-3 w-3" />
                        Active
                      </span>
                    )}
                  </div>
                  {priceFormatted && <p className="text-xs text-muted-foreground mt-0.5">{priceFormatted} / month</p>}
                </div>

                {isOwner && (
                  <Button
                    variant={isActive ? "outline" : "default"}
                    size="sm"
                    className={cn(
                      "shrink-0",
                      isActive && "text-destructive border-destructive/40 hover:bg-destructive/10"
                    )}
                    disabled={isThisPending || !hasActiveSubscription}
                    onClick={() => setDialog({ lookupKey, action: isActive ? "remove" : "add" })}
                  >
                    {isThisPending ? (
                      <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />
                    ) : isActive ? (
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {isActive ? "Remove" : "Add"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </SettingsSection>

      <AlertDialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAdding ? `Add ${pendingCfg?.name}?` : `Remove ${pendingCfg?.name}?`}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {isAdding && pendingPriceFormatted ? (
                  <>
                    <p>
                      You will be charged a pro-rated amount now for the remainder of the current billing period, then{" "}
                      <span className="font-medium text-foreground">{pendingPriceFormatted} per month</span> will be
                      added to your subscription.
                    </p>
                    <p className="text-xs">
                      This charge will appear on the payment method on file and will recur monthly until the addon is
                      removed.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      The {pendingCfg?.name} addon will be removed from your subscription. You will receive a pro-rated
                      credit for the unused portion of the current billing period.
                    </p>
                    <p className="text-xs">
                      Any features provided by this addon will no longer be available after removal.
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={cn(!isAdding && "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
            >
              {isAdding ? `Add ${pendingCfg?.name}` : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
