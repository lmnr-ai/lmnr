"use client";

import { Check, ExternalLink, Info, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  cancelSubscription,
  getPaymentMethodPortalUrl,
  type SubscriptionDetails,
  switchTier,
  type UpcomingInvoiceInfo,
} from "@/lib/checkout/actions";
import { type PaidTier, TIER_CONFIG } from "@/lib/checkout/constants";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { cn } from "@/lib/utils";
import { type Workspace } from "@/lib/workspaces/types";

interface WorkspaceBillingProps {
  workspace: Workspace;
  isOwner: boolean;
  subscription: SubscriptionDetails | null;
  upcomingInvoice: UpcomingInvoiceInfo | null;
}

type TierKey = "free" | "hobby" | "pro" | "enterprise";

interface TierInfo {
  name: string;
  price: string;
  priceSubtext: string;
  features: string[];
  subfeatures: (string | null)[];
}

const TIERS: { key: TierKey; info: TierInfo }[] = [
  {
    key: "free",
    info: {
      name: "Free",
      price: "$0",
      priceSubtext: "/ mo",
      features: ["1 GB data", "100 signal runs", "15 day retention"],
      subfeatures: [null, null, null],
    },
  },
  {
    key: "hobby",
    info: {
      name: "Hobby",
      price: "$25",
      priceSubtext: "/ mo",
      features: ["3 GB data", "1,000 signal runs", "30 day retention"],
      subfeatures: ["$2 / GB overage", "$0.02 / run overage", null],
    },
  },
  {
    key: "pro",
    info: {
      name: "Pro",
      price: "$150",
      priceSubtext: "/ mo",
      features: ["10 GB data", "10,000 signal runs", "90 day retention"],
      subfeatures: ["$1.50 / GB overage", "$0.015 / run overage", null],
    },
  },
  {
    key: "enterprise",
    info: {
      name: "Enterprise",
      price: "Custom",
      priceSubtext: "",
      features: ["Custom limits", "On-premise", "Dedicated support"],
      subfeatures: [null, null, null],
    },
  },
];

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function WorkspaceBilling({ workspace, isOwner, subscription, upcomingInvoice }: WorkspaceBillingProps) {
  const router = useRouter();
  const [isSwitching, startSwitchTransition] = useTransition();
  const [isCanceling, startCancelTransition] = useTransition();
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [switchingToTier, setSwitchingToTier] = useState<TierKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentTierKey: TierKey = subscription ? (subscription.currentTier as TierKey) : "free";
  const currentTierInfo = TIERS.find((t) => t.key === currentTierKey)?.info;
  const isFree = !subscription || currentTierKey === "free";
  const hasDataplaneAddon = workspace.addons.includes("data-plane");

  const handleSwitchTier = (newTier: PaidTier) => {
    setError(null);
    setSwitchingToTier(newTier);
    startSwitchTransition(async () => {
      try {
        await switchTier(workspace.id, newTier);
        router.refresh();
      } catch (e: any) {
        setError(e.message ?? "Failed to switch tier");
      } finally {
        setSwitchingToTier(null);
      }
    });
  };

  const handleManagePaymentMethods = async () => {
    setIsLoadingPortal(true);
    try {
      const returnUrl = `${window.location.origin}/checkout/portal?workspaceId=${workspace.id}`;
      const portalUrl = await getPaymentMethodPortalUrl(workspace.id, returnUrl);
      window.location.href = portalUrl;
    } catch (e: any) {
      setError(e.message ?? "Failed to open payment methods");
      setIsLoadingPortal(false);
    }
  };

  const handleCancel = () => {
    setError(null);
    startCancelTransition(async () => {
      try {
        await cancelSubscription(workspace.id);
        router.refresh();
      } catch (e: any) {
        setError(e.message ?? "Failed to cancel subscription");
      }
    });
  };

  const getActionForTier = (tierKey: TierKey): "current" | "upgrade" | "downgrade" | "contact" => {
    if (tierKey === currentTierKey) return "current";
    if (tierKey === "enterprise") return "contact";

    const tierOrder = ["free", "hobby", "pro"];
    const currentIndex = tierOrder.indexOf(currentTierKey);
    const targetIndex = tierOrder.indexOf(tierKey);

    if (currentIndex === -1 || targetIndex === -1) return "contact";
    return targetIndex > currentIndex ? "upgrade" : "downgrade";
  };

  return (
    <>
      <SettingsSectionHeader title="Billing" description="Manage your workspace plan and billing" />

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      {/* Current Plan & Upcoming Invoice - only show for paid tiers */}
      {subscription && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Current plan</CardTitle>
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-md font-medium",
                    subscription.cancelAtPeriodEnd
                      ? "bg-orange-500/10 text-orange-600"
                      : "bg-green-500/10 text-green-600"
                  )}
                >
                  {subscription.cancelAtPeriodEnd ? "Cancels at period end" : subscription.status}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{currentTierInfo?.name ?? workspace.tierName}</span>
                <span className="text-muted-foreground">
                  {currentTierInfo?.price}
                  {currentTierInfo?.priceSubtext && ` ${currentTierInfo.priceSubtext}`}
                </span>
              </div>
              <div className="text-sm text-secondary-foreground">
                {formatDate(subscription.currentPeriodStart)} – {formatDate(subscription.currentPeriodEnd)}
              </div>
              {subscription.cancelAtPeriodEnd && (
                <p className="text-sm text-orange-600">Access until {formatDate(subscription.currentPeriodEnd)}</p>
              )}
              {!subscription.cancelAtPeriodEnd && isOwner && (
                <div className="pt-2 flex gap-2">
                  <Button
                    className="bg-secondary"
                    variant="outline"
                    onClick={handleManagePaymentMethods}
                    disabled={isLoadingPortal}
                  >
                    {isLoadingPortal && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
                    Payment methods
                    <ExternalLink className="h-3 w-3 ml-1.5" />
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive border-destructive hover:bg-destructive/10"
                    onClick={handleCancel}
                    disabled={isCanceling}
                  >
                    {isCanceling && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {upcomingInvoice && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Upcoming invoice</CardTitle>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground font-medium flex items-center gap-1 cursor-help">
                        <Info className="h-3 w-3" />
                        Estimated
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px] text-center">
                      <p>This is an estimate. The final amount may change based on your usage.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <CardDescription className="text-xs">Due {formatDate(upcomingInvoice.periodEnd)}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md divide-y text-sm">
                  {upcomingInvoice.lines.map((line, i) => (
                    <div key={i} className="flex justify-between items-center px-3 py-2">
                      <span className="text-secondary-foreground truncate mr-2">{line.description}</span>
                      <span className="font-mono text-xs">{formatCurrency(line.amount, upcomingInvoice.currency)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-3 py-2 font-medium bg-secondary/30">
                    <span>Total</span>
                    <span className="font-mono">
                      {formatCurrency(upcomingInvoice.amountDue, upcomingInvoice.currency)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Plans */}
      <SettingsSection>
        <SettingsSectionHeader size="sm" title="Plans" description="Compare and switch between available plans" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {TIERS.map(({ key, info }) => {
            const action = getActionForTier(key);
            const isCurrent = action === "current";
            const isPro = key === "pro";
            const isEnterprise = key === "enterprise";
            const isPaidTier = key === "hobby" || key === "pro";

            return (
              <div
                key={key}
                className={cn(
                  "p-4 rounded-lg border flex flex-col justify-between min-h-[180px]",
                  isCurrent && "ring-2 ring-primary border-primary bg-primary/5",
                  isPro && !isCurrent && "border-primary/50"
                )}
              >
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">{info.name}</h3>
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-medium">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xl font-bold">{info.price}</span>
                      {info.priceSubtext && <span className="text-xs text-muted-foreground">{info.priceSubtext}</span>}
                    </div>
                  </div>

                  <div className="space-y-1">
                    {info.features.map((feature, index) => (
                      <div key={index} className="text-xs text-muted-foreground">
                        {feature}
                        {info.subfeatures[index] && (
                          <span className="text-[10px] ml-1 opacity-70">({info.subfeatures[index]})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3">
                  {isCurrent ? (
                    <Button variant="secondary" size="sm" className="w-full h-8 text-xs" disabled>
                      Current
                    </Button>
                  ) : isEnterprise ? (
                    <Link href="mailto:founders@lmnr.ai?subject=Enterprise%20Inquiry" className="block">
                      <Button variant="outline" size="sm" className="w-full h-8 text-xs">
                        Contact us
                      </Button>
                    </Link>
                  ) : subscription?.cancelAtPeriodEnd ? (
                    <Button variant="secondary" size="sm" className="w-full h-8 text-xs" disabled>
                      {action === "upgrade" ? "Upgrade" : "Downgrade"}
                    </Button>
                  ) : isFree && isPaidTier ? (
                    <Link
                      href={`/checkout?lookupKey=${TIER_CONFIG[key as PaidTier].lookupKey}&workspaceId=${workspace.id}&workspaceName=${encodeURIComponent(workspace.name)}`}
                      className="block"
                    >
                      <Button variant={isPro ? "default" : "outline"} size="sm" className="w-full h-8 text-xs">
                        Upgrade
                      </Button>
                    </Link>
                  ) : isOwner && isPaidTier ? (
                    <Button
                      variant={action === "upgrade" ? "default" : "outline"}
                      size="sm"
                      className="w-full h-8 text-xs"
                      disabled={isSwitching}
                      onClick={() => handleSwitchTier(key as PaidTier)}
                    >
                      {switchingToTier === key && <Loader2 className="animate-spin h-3 w-3 mr-1" />}
                      {action === "upgrade" ? "Upgrade" : "Downgrade"}
                    </Button>
                  ) : (
                    <Button variant="secondary" size="sm" className="w-full h-8 text-xs" disabled>
                      {action === "upgrade" ? "Upgrade" : "Downgrade"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </SettingsSection>

      {/* Add-ons Section - Pro tier only */}
      {subscription?.currentTier === "pro" && isFeatureEnabled(Feature.ADDONS) && (
        <SettingsSection>
          <SettingsSectionHeader
            size="sm"
            title="Add-ons"
            description="Enhance your workspace with additional features"
          />
          {!hasDataplaneAddon ? (
            <div className="flex items-center justify-between border rounded-md p-4 max-w-md">
              <div>
                <p className="text-sm font-medium">Data Plane Addon</p>
                <p className="text-xs text-muted-foreground">Deploy in your own infrastructure</p>
              </div>
              <Link
                href={`/checkout?lookupKey=pro_monthly_2026_02_addon_dataplane&workspaceId=${workspace.id}&workspaceName=${encodeURIComponent(workspace.name)}`}
              >
                <Button variant="outline" size="sm">
                  Add
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-secondary-foreground">
              <Check className="h-4 w-4 text-green-500" />
              <span>Data Plane Addon active</span>
            </div>
          )}
        </SettingsSection>
      )}
    </>
  );
}
