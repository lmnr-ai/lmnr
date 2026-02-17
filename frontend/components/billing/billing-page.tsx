"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

interface BillingPageProps {
  workspaceId: string;
  workspaceName: string;
  subscription: SubscriptionDetails | null;
  upcomingInvoice: UpcomingInvoiceInfo | null;
  hasDataplaneAddon: boolean;
}

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

const TIER_DISPLAY: Record<PaidTier, { label: string; price: string; features: string[] }> = {
  hobby: {
    label: "Hobby",
    price: "$25/month",
    features: ["3 GB data included", "1,000 signal runs included"],
  },
  pro: {
    label: "Pro",
    price: "$50/month",
    features: ["10 GB data included", "10,000 signal runs included"],
  },
};

export default function BillingPage({
  workspaceId,
  workspaceName,
  subscription,
  upcomingInvoice,
  hasDataplaneAddon,
}: BillingPageProps) {
  const router = useRouter();
  const [isSwitching, startSwitchTransition] = useTransition();
  const [isCanceling, startCancelTransition] = useTransition();
  const [isLoadingPortal, setIsLoadingPortal] = useState(false);
  const [cancelResult, setCancelResult] = useState<{
    cancelAt: number;
    upcomingInvoice: UpcomingInvoiceInfo | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const otherTier: PaidTier | null = subscription ? (subscription.currentTier === "hobby" ? "pro" : "hobby") : null;

  const handleSwitchTier = (newTier: PaidTier) => {
    setError(null);
    startSwitchTransition(async () => {
      try {
        await switchTier(workspaceId, newTier);
        router.refresh();
      } catch (e: any) {
        setError(e.message ?? "Failed to switch tier");
      }
    });
  };

  const handleCancel = () => {
    setError(null);
    startCancelTransition(async () => {
      try {
        const result = await cancelSubscription(workspaceId);
        setCancelResult(result);
        router.refresh();
      } catch (e: any) {
        setError(e.message ?? "Failed to cancel subscription");
      }
    });
  };

  const handleManagePaymentMethods = async () => {
    setIsLoadingPortal(true);
    try {
      const returnUrl = `${window.location.origin}/checkout/portal?workspaceId=${workspaceId}`;
      const portalUrl = await getPaymentMethodPortalUrl(workspaceId, returnUrl);
      window.location.href = portalUrl;
    } catch (e: any) {
      setError(e.message ?? "Failed to open payment methods");
      setIsLoadingPortal(false);
    }
  };

  const isFree = !subscription;

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-md p-3 text-sm">
          {error}
        </div>
      )}

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            {isFree
              ? "You are on the Free tier."
              : `You are on the ${TIER_DISPLAY[subscription.currentTier].label} tier.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {subscription && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-secondary-foreground">Status:</span>
                <span
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded-md font-mono border",
                    subscription.cancelAtPeriodEnd
                      ? "border-orange-500/30 bg-orange-500/10 text-orange-600"
                      : "border-green-500/30 bg-green-500/10 text-green-600"
                  )}
                >
                  {subscription.cancelAtPeriodEnd ? "Cancels at period end" : subscription.status}
                </span>
              </div>
              <div className="text-sm text-secondary-foreground">
                Current period: {formatDate(subscription.currentPeriodStart)} &mdash;{" "}
                {formatDate(subscription.currentPeriodEnd)}
              </div>
              {subscription.cancelAtPeriodEnd && (
                <p className="text-sm text-orange-600">
                  Your subscription will end on {formatDate(subscription.currentPeriodEnd)}. You will retain access
                  until then.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Switch Tier */}
      {!subscription?.cancelAtPeriodEnd && (
        <Card>
          <CardHeader>
            <CardTitle>{isFree ? "Upgrade your plan" : "Switch plan"}</CardTitle>
            <CardDescription>
              {isFree
                ? "Choose a paid plan to unlock more features."
                : `Switch from ${TIER_DISPLAY[subscription.currentTier].label} to ${otherTier ? TIER_DISPLAY[otherTier].label : ""}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isFree ? (
              <div className="flex gap-4">
                {(Object.entries(TIER_DISPLAY) as [PaidTier, (typeof TIER_DISPLAY)[PaidTier]][]).map(
                  ([tier, display]) => (
                    <Link
                      key={tier}
                      href={`/checkout?lookupKey=${TIER_CONFIG[tier].lookupKey}&workspaceId=${workspaceId}&workspaceName=${encodeURIComponent(workspaceName)}`}
                    >
                      <Button variant={tier === "pro" ? "default" : "secondary"}>
                        Upgrade to {display.label} ({display.price})
                      </Button>
                    </Link>
                  )
                )}
              </div>
            ) : otherTier ? (
              <div className="flex flex-col gap-3">
                <div className="border rounded-md p-4 bg-secondary/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{TIER_DISPLAY[otherTier].label}</p>
                      <p className="text-sm text-muted-foreground">{TIER_DISPLAY[otherTier].price}</p>
                      <ul className="mt-2 text-sm text-secondary-foreground list-disc list-inside">
                        {TIER_DISPLAY[otherTier].features.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" disabled={isSwitching}>
                          {isSwitching && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
                          Switch to {TIER_DISPLAY[otherTier].label}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Switch to {TIER_DISPLAY[otherTier].label}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Your subscription will be updated immediately. Overage usage will be recalculated based on
                            the new tier&apos;s included amounts.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleSwitchTier(otherTier)}>
                            Confirm switch
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Add-ons Section - Pro tier only */}
      {subscription?.currentTier === "pro" && isFeatureEnabled(Feature.ADDONS) && (
        <Card>
          <CardHeader>
            <CardTitle>Add-ons</CardTitle>
            <CardDescription>Enhance your workspace with additional features.</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasDataplaneAddon ? (
              <div className="border rounded-md p-4 bg-secondary/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Data Plane Addon</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Deploy Laminar data plane in your own infrastructure for enhanced data privacy
                    </p>
                  </div>
                  <Link
                    href={`/checkout?lookupKey=pro_monthly_2026_02_addon_dataplane&workspaceId=${workspaceId}&workspaceName=${encodeURIComponent(workspaceName)}`}
                  >
                    <Button variant="outline">Add to subscription</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-secondary-foreground">
                <span className="text-green-600">✓</span>
                <span>Data Plane Addon active</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upcoming Invoice */}
      {upcomingInvoice && !cancelResult && (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming invoice</CardTitle>
            <CardDescription>
              This is an estimate and may change based on your usage before the billing date.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-600 font-mono">
                Estimated
              </span>
              <span className="text-sm text-secondary-foreground">Due {formatDate(upcomingInvoice.periodEnd)}</span>
            </div>
            <div className="border rounded-md divide-y">
              {upcomingInvoice.lines.map((line, i) => (
                <div key={i} className="flex justify-between items-center px-4 py-2 text-sm">
                  <span className="text-secondary-foreground">{line.description}</span>
                  <span className="font-mono">{formatCurrency(line.amount, upcomingInvoice.currency)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center px-4 py-2 text-sm font-medium">
                <span>Total</span>
                <span className="font-mono">{formatCurrency(upcomingInvoice.amountDue, upcomingInvoice.currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancellation result */}
      {cancelResult && (
        <Card>
          <CardHeader>
            <CardTitle>Subscription canceled</CardTitle>
            <CardDescription>Your subscription will end on {formatDate(cancelResult.cancelAt)}.</CardDescription>
          </CardHeader>
          {cancelResult.upcomingInvoice && (
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-secondary-foreground">
                Your final invoice of{" "}
                <span className="font-medium">
                  {formatCurrency(cancelResult.upcomingInvoice.amountDue, cancelResult.upcomingInvoice.currency)}
                </span>{" "}
                will be charged on {formatDate(cancelResult.upcomingInvoice.periodEnd)}.
              </p>
            </CardContent>
          )}
        </Card>
      )}

      {/* Payment Methods & Cancel */}
      {subscription && !subscription.cancelAtPeriodEnd && (
        <div className="flex gap-4">
          <Button variant="outline" onClick={handleManagePaymentMethods} disabled={isLoadingPortal}>
            {isLoadingPortal && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
            Manage payment methods
            <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={isCanceling}>
                {isCanceling && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
                Cancel subscription
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel subscription?</AlertDialogTitle>
                <AlertDialogDescription>
                  Your subscription will remain active until the end of the current billing period (
                  {formatDate(subscription.currentPeriodEnd)}). After that, your workspace will be downgraded to the
                  Free tier.
                  {upcomingInvoice && (
                    <>
                      {" "}
                      Your final invoice will be {formatCurrency(upcomingInvoice.amountDue, upcomingInvoice.currency)}.
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleCancel}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Confirm cancellation
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
