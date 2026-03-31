import { type NextRequest } from "next/server";
import Stripe from "stripe";

import {
  type ItemDescription,
  LOOKUP_KEY_DISPLAY_NAMES,
  LOOKUP_KEY_TO_TIER_NAME,
  type PaidTier,
  TIER_CONFIG,
} from "@/lib/actions/checkout/types";
import { handleInvoiceFinalized, handleSubscriptionChange } from "@/lib/actions/checkout/webhook";
import { sendOnPaymentFailedEmail, sendOnPaymentReceivedEmail } from "@/lib/emails/utils";

function getLookupKey(line: Stripe.InvoiceLineItem): string | null {
  // Stripe still sends the legacy `price` field as an expanded object in webhooks
  // even though the v20 types omit it.
  const legacyPrice = (line as unknown as Record<string, unknown>)["price"];
  if (typeof legacyPrice === "object" && legacyPrice && "lookup_key" in legacyPrice) {
    return (legacyPrice as { lookup_key: string | null }).lookup_key;
  }
  return null;
}

function buildItemDescriptions(lines: Stripe.InvoiceLineItem[]): ItemDescription[] {
  return lines
    .filter((line) => line.amount > 0)
    .map((line) => {
      const lookupKey = getLookupKey(line);
      const productDescription = (lookupKey && LOOKUP_KEY_DISPLAY_NAMES[lookupKey]) ?? line.description ?? "";
      const shortDescription = lookupKey ? LOOKUP_KEY_TO_TIER_NAME[lookupKey] : undefined;
      return { productDescription, quantity: line.quantity ?? undefined, shortDescription };
    });
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
    existingLookupKeys.has(tierConfig.overageSignalRunsLookupKey)
  ) {
    return;
  }

  const overagePrices = await s.prices.list({
    lookup_keys: [tierConfig.overageMegabytesLookupKey, tierConfig.overageSignalRunsLookupKey],
  });

  const bytesOveragePrice = overagePrices.data.find((p) => p.lookup_key === tierConfig.overageMegabytesLookupKey);
  const signalRunsOveragePrice = overagePrices.data.find((p) => p.lookup_key === tierConfig.overageSignalRunsLookupKey);

  if (!bytesOveragePrice || !signalRunsOveragePrice) {
    console.error(`Could not resolve overage prices for tier ${tierEntry[0]}`);
    return;
  }

  const items: Stripe.SubscriptionUpdateParams.Item[] = [];
  if (!existingLookupKeys.has(tierConfig.overageMegabytesLookupKey)) {
    items.push({ price: bytesOveragePrice.id });
  }
  if (!existingLookupKeys.has(tierConfig.overageSignalRunsLookupKey)) {
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
      const itemDescriptions = buildItemDescriptions(invoice.lines.data);
      const customerEmail = invoice.customer_email;
      const date = new Date(invoice.created * 1000).toLocaleDateString();
      if (customerEmail && itemDescriptions.length > 0) {
        await sendOnPaymentReceivedEmail(customerEmail, itemDescriptions, date);
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      if (!invoice.attempted) break;
      if (invoice.amount_due <= 0) break;
      const itemDescriptions = buildItemDescriptions(invoice.lines.data);
      const customerEmail = invoice.customer_email;
      const date = new Date(invoice.created * 1000).toLocaleDateString();
      if (customerEmail && itemDescriptions.length > 0) {
        await sendOnPaymentFailedEmail(customerEmail, itemDescriptions, date);
      }
      break;
    }
    case "invoice.finalized": {
      const invoice = event.data.object;

      if (invoice.parent?.type !== "subscription_details") break;

      // Filter: must contain a line for a known overage price.
      // This excludes addon-only invoices and other unrelated invoices.
      const knownLookupKeys = new Set<string>(
        Object.values(TIER_CONFIG).flatMap((c) => [c.overageMegabytesLookupKey, c.overageSignalRunsLookupKey])
      );
      let hasBytesOverage = false;
      let hasSignalRunsOverage = false;
      let resetTime: Date | null = null;
      const relevantLines = invoice.lines.data.filter((line) => {
        const priceObj = (line as any).price ?? line.pricing?.price_details?.price;
        const lookupKey = typeof priceObj === "object" && priceObj ? priceObj.lookup_key : null;
        if (lookupKey) {
          if (String(lookupKey).toLowerCase().includes("signal_runs")) {
            hasSignalRunsOverage = true;
            resetTime = new Date(line.period.end * 1000);
          } else if (String(lookupKey).toLowerCase().includes("bytes")) {
            hasBytesOverage = true;
            // it's fine to override here, most of the times they are same
            resetTime = new Date(line.period.end * 1000);
          }
        }
        return lookupKey && knownLookupKeys.has(lookupKey);
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
