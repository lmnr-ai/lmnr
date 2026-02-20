"use client";

import { Loader2, Plus, Server, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ADDON_CONFIG } from "@/lib/actions/checkout/types";
import { cn } from "@/lib/utils";

interface WorkspaceAddonsProps {
  workspaceId: string;
  currentTierKey: string;
  activeAddonSlugs: string[];
  canManageBilling: boolean;
  hasActiveSubscription: boolean;
  onError: (message: string) => void;
}

function formatPrice(dollars: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(dollars);
}

export async function buyAddon(workspaceId: string, lookupKey: string): Promise<void> {
  const res = await fetch(`/api/workspaces/${workspaceId}/addons/${lookupKey}`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Failed to add addon");
  }
}

async function removeAddon(workspaceId: string, lookupKey: string): Promise<void> {
  const res = await fetch(`/api/workspaces/${workspaceId}/addons/${lookupKey}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error ?? "Failed to remove addon");
  }
}

export default function WorkspaceAddons({
  workspaceId,
  currentTierKey,
  activeAddonSlugs,
  canManageBilling,
  hasActiveSubscription,
  onError,
}: WorkspaceAddonsProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ lookupKey: string; action: "add" | "remove" } | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const eligibleAddons = Object.entries(ADDON_CONFIG).filter(([, cfg]) => cfg.eligibleTiers.includes(currentTierKey));

  const handleConfirm = async () => {
    if (!dialog) return;
    const { lookupKey, action } = dialog;
    setDialog(null);
    setPendingKey(lookupKey);
    try {
      if (action === "add") {
        await buyAddon(workspaceId, lookupKey);
      } else {
        await removeAddon(workspaceId, lookupKey);
      }
      router.refresh();
    } catch (e) {
      if (e instanceof Error) {
        onError(e.message ?? `Failed to ${action} addon`);
      }
    } finally {
      setPendingKey(null);
    }
  };

  const pendingCfg = dialog ? ADDON_CONFIG[dialog.lookupKey] : null;
  const pendingPrice = pendingCfg?.costs[currentTierKey];
  const pendingPriceFormatted = pendingPrice !== undefined ? formatPrice(pendingPrice) : null;
  const isAdding = dialog?.action === "add";

  if (eligibleAddons.length === 0) return null;
  return (
    <>
      <SettingsSection>
        <SettingsSectionHeader
          size="sm"
          title="Add-ons"
          description="Enhance your workspace with additional features"
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
          {eligibleAddons.map(([lookupKey, cfg]) => {
            const isActive = activeAddonSlugs.includes(cfg.slug);
            const price = cfg.costs[currentTierKey];
            const priceFormatted = price !== undefined ? formatPrice(price) : null;
            const isThisPending = pendingKey === lookupKey;

            return (
              <Card key={lookupKey} className={cn(isActive && "ring-2 ring-primary border-primary")}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex items-center justify-center h-9 w-9 rounded-lg",
                          isActive ? "bg-primary/10" : "bg-muted"
                        )}
                      >
                        <Server className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                      </div>
                      <div>
                        <CardTitle className="text-base">{cfg.name}</CardTitle>
                        {priceFormatted && (
                          <p className="text-xs text-muted-foreground mt-0.5">{priceFormatted} / month</p>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
                        Active
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Deploy a dedicated data plane for enhanced performance and data isolation.
                  </p>
                  {canManageBilling && (
                    <Button
                      variant="outline"
                      className="bg-secondary ml-auto"
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
                      {isActive ? "Remove addon" : "Add addon"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </SettingsSection>

      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isAdding ? `Add ${pendingCfg?.name}` : `Remove ${pendingCfg?.name}`}</DialogTitle>
            <DialogDescription>
              {isAdding
                ? "This addon will be added to your subscription."
                : "This addon will be removed from your subscription."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-secondary-foreground">
            {isAdding && pendingPriceFormatted ? (
              <>
                <p>
                  You will be charged a pro-rated amount now for the remainder of the current billing period, then{" "}
                  <span className="font-medium text-foreground">{pendingPriceFormatted} per month</span> will be added
                  to your subscription.
                </p>
                <p className="text-xs text-muted-foreground">
                  This charge will appear on the payment method on file and will recur monthly.
                </p>
              </>
            ) : (
              <>
                <p>
                  The {pendingCfg?.name} addon will be removed from your subscription. You will receive a pro-rated
                  credit for the unused portion of the current billing period.
                </p>
                <p className="text-xs text-muted-foreground">
                  Any features provided by this addon will no longer be available after removal.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button variant={isAdding ? "default" : "destructive"} onClick={handleConfirm}>
              {isAdding ? `Add ${pendingCfg?.name}` : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
