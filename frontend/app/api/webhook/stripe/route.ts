import { type NextRequest } from "next/server";
import Stripe from "stripe";

import { type PaidTier, TIER_CONFIG } from "@/lib/actions/checkout/types";
import { handleInvoiceFinalized, handleSubscriptionChange } from "@/lib/actions/checkout/webhook";
import { sendOnPaymentFailedEmail, sendOnPaymentReceivedEmail } from "@/lib/emails/utils";

// Stripe zero-decimal currencies are billed in their major units directly.
// https://docs.stripe.com/currencies#zero-decimal
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

function formatInvoiceTotal(amount: number, currency: string): string {
  const code = (currency || "usd").toLowerCase();
  const majorUnits = ZERO_DECIMAL_CURRENCIES.has(code) ? amount : amount / 100;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code.toUpperCase() }).format(majorUnits);
  } catch {
    return `${code.toUpperCase()} ${majorUnits.toFixed(ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2)}`;
  }
}

// Stripe stores our workspace binding in the subscription's metadata (set at
// checkout). The invoice inherits it via `parent.subscription_details.metadata`;
// older invoices may also carry it on `invoice.metadata` directly.
function getWorkspaceId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  const fromSubscription =
    parent?.type === "subscription_details" ? parent.subscription_details?.metadata?.workspaceId : undefined;
  return fromSubscription ?? invoice.metadata?.workspaceId ?? null;
}

/**
 * After checkout creates a subscription with only the flat plan price,
 * this function resolves the matching overage prices from TIER_CONFIG
 * and adds them as metered subscription items.
 */
async function addOveragePricesToSubscription(subscription: Stripe.Subscription): Promise<void> {
  // Find the tier by matching the flat price lookup key
  const flatItem = subscription.items.data.find((item) => item.price.recurring?.usage_type !== "metered");
  const flatLookupKey = flatItem?.price.lookup_key;
  if (!flatLookupKey) return;

  const tierEntry = Object.entries(TIER_CONFIG).find(([, config]) => config.lookupKey === flatLookupKey);
  if (!tierEntry) return;

  const tierConfig = TIER_CONFIG[tierEntry[0] as PaidTier];

  const s = new Stripe(process.env.STRIPE_SECRET_KEY!);

  // Fetch the subscription fresh from Stripe so the idempotency check sees
  // the current state, not the stale snapshot from the webhook event payload.
  const freshSubscription = await s.subscriptions.retrieve(subscription.id, {
    expand: ["items.data.price"],
  });

  // Check if overage items already exist (idempotency – e.g. if the webhook is retried)
  const existingLookupKeys = new Set(freshSubscription.items.data.map((item) => item.price.lookup_key));
  if (
    existingLookupKeys.has(tierConfig.overageMegabytesLookupKey) &&
    existingLookupKeys.has(tierConfig.overageSignalCostLookupKey)
  ) {
    return;
  }

  const overagePrices = await s.prices.list({
    lookup_keys: [tierConfig.overageMegabytesLookupKey, tierConfig.overageSignalCostLookupKey],
  });

  const bytesOveragePrice = overagePrices.data.find((p) => p.lookup_key === tierConfig.overageMegabytesLookupKey);
  const signalRunsOveragePrice = overagePrices.data.find((p) => p.lookup_key === tierConfig.overageSignalCostLookupKey);

  if (!bytesOveragePrice || !signalRunsOveragePrice) {
    console.error(`Could not resolve overage prices for tier ${tierEntry[0]}`);
    return;
  }

  const items: Stripe.SubscriptionUpdateParams.Item[] = [];
  if (!existingLookupKeys.has(tierConfig.overageMegabytesLookupKey)) {
    items.push({ price: bytesOveragePrice.id });
  }
  if (!existingLookupKeys.has(tierConfig.overageSignalCostLookupKey)) {
    items.push({ price: signalRunsOveragePrice.id });
  }

  if (items.length > 0) {
    await s.subscriptions.update(subscription.id, {
      items,
      proration_behavior: "none",
    });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  let event;
  const endpointSecret = process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET;
  // Get the signature sent by Stripe
  const signature = req.headers.get("stripe-signature") as string;
  try {
    event = Stripe.webhooks.constructEvent(await req.text(), signature, endpointSecret!);
  } catch (err: Error | any) {
    console.error(`⚠️  Webhook signature verification failed.`, err.message);
    return new Response("Webhook signature verification failed.", {
      status: 400,
    });
  }
  // Handle the event
  switch (event.type) {
    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      if (invoice.amount_paid <= 0) break;
      const customerEmail = invoice.customer_email;
      const workspaceId = getWorkspaceId(invoice);
      if (!customerEmail) break;
      if (!workspaceId) {
        console.log("invoice.payment_succeeded: no workspaceId in subscription metadata");
        break;
      }
      await sendOnPaymentReceivedEmail({
        email: customerEmail,
        workspaceId,
        total: formatInvoiceTotal(invoice.amount_paid, invoice.currency),
        date: new Date(invoice.created * 1000).toLocaleDateString(),
      });
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      if (!invoice.attempted) break;
      if (invoice.amount_due <= 0) break;
      const customerEmail = invoice.customer_email;
      const workspaceId = getWorkspaceId(invoice);
      if (!customerEmail) break;
      if (!workspaceId) {
        console.log("invoice.payment_failed: no workspaceId in subscription metadata");
        break;
      }
      await sendOnPaymentFailedEmail({
        email: customerEmail,
        workspaceId,
        total: formatInvoiceTotal(invoice.amount_due, invoice.currency),
        date: new Date(invoice.created * 1000).toLocaleDateString(),
      });
      break;
    }
    case "invoice.finalized": {
      const invoice = event.data.object;

      if (invoice.parent?.type !== "subscription_details") break;

      // Filter: must contain a line for a signal or data overage price.
      // We match on the lookup-key shape ("signal" / "bytes" substrings) rather
      // than an exact TIER_CONFIG allowlist so that subscriptions still billing
      // a previous overage price are still recognised and reset. An exact-match
      // gate would silently skip those cycles' billing reset + cache
      // invalidation. This excludes addon-only and other unrelated invoices.
      let hasBytesOverage = false;
      let hasSignalRunsOverage = false;
      let resetTime: Date | null = null;
      const relevantLines = invoice.lines.data.filter((line) => {
        const priceObj = (line as any).price ?? line.pricing?.price_details?.price;
        const lookupKey = typeof priceObj === "object" && priceObj ? priceObj.lookup_key : null;
        if (!lookupKey) return false;
        const normalizedLookupKey = String(lookupKey).toLowerCase();
        if (normalizedLookupKey.includes("signal")) {
          // includes signal runs or signal steps lookup key
          hasSignalRunsOverage = true;
          resetTime = new Date(line.period.end * 1000);
          return true;
        }
        if (normalizedLookupKey.includes("bytes")) {
          hasBytesOverage = true;
          // it's fine to override here, most of the times they are same
          resetTime = new Date(line.period.end * 1000);
          return true;
        }
        return false;
      });
      if (relevantLines.length === 0) break;

      const workspaceId = invoice.metadata?.workspaceId ?? invoice.parent.subscription_details?.metadata?.workspaceId;
      if (!workspaceId) {
        console.log("invoice.finalized: no workspaceId in subscription metadata");
        break;
      }

      await handleInvoiceFinalized(workspaceId, hasBytesOverage, hasSignalRunsOverage, resetTime);
      break;
    }
    case "customer.subscription.deleted":
      await handleSubscriptionChange(event, true);
      break;
    case "customer.subscription.created":
      await handleSubscriptionChange(event);
      await addOveragePricesToSubscription(event.data.object);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionChange(event);
      break;
    // NOTE: if adding new events here, don't forget to enable them via Stripe Workbench
    default:
      break;
  }
  return new Response("Webhook received.", { status: 200 });
}
