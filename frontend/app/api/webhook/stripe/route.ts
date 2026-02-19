import { type NextRequest } from "next/server";
import stripe from "stripe";

import { type ItemDescription, LOOKUP_KEY_TO_TIER_NAME, TIER_CONFIG } from "@/lib/actions/checkout/types";
import { handleInvoiceFinalized, handleSubscriptionChange } from "@/lib/actions/checkout/webhook";
import { sendOnPaymentFailedEmail, sendOnPaymentReceivedEmail } from "@/lib/emails/utils";

export async function POST(req: NextRequest): Promise<Response> {
  let event;
  const endpointSecret = process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET;
  // Get the signature sent by Stripe
  const signature = req.headers.get("stripe-signature") as string;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, endpointSecret!);
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
      const itemDescriptions = invoice.lines.data.map((line) => {
        const productDescription = line.description ?? "";
        const priceObj = line.pricing?.price_details?.price;
        const lookupKey = typeof priceObj === "object" && priceObj ? priceObj.lookup_key : null;
        const shortDescription = lookupKey ? LOOKUP_KEY_TO_TIER_NAME[lookupKey] : undefined;
        return {
          productDescription,
          quantity: line.quantity,
          shortDescription,
        } as ItemDescription;
      });
      const customerEmail = invoice.customer_email;
      const date = new Date(invoice.created * 1000).toLocaleDateString();
      if (customerEmail) {
        await sendOnPaymentReceivedEmail(customerEmail, itemDescriptions, date);
      }
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      if (!invoice.attempted) {
        break;
      }
      const itemDescriptions = invoice.lines.data.map((line) => {
        const productDescription = line.description ?? "";
        const priceObj = line.pricing?.price_details?.price;
        const lookupKey = typeof priceObj === "object" && priceObj ? priceObj.lookup_key : null;
        const shortDescription = lookupKey ? LOOKUP_KEY_TO_TIER_NAME[lookupKey] : undefined;
        return {
          productDescription,
          quantity: line.quantity,
          shortDescription,
        } as ItemDescription;
      });
      const customerEmail = invoice.customer_email;
      const date = new Date(invoice.created * 1000).toLocaleDateString();
      if (customerEmail) {
        await sendOnPaymentFailedEmail(customerEmail, itemDescriptions, date);
      }
      break;
    }
    case "invoice.finalized": {
      const invoice = event.data.object;

      if (invoice.parent?.type !== "subscription_details") break;

      // Filter: must contain a line for a known tier or overage price.
      // This excludes addon-only invoices and other unrelated invoices.
      const knownLookupKeys = new Set<string>(
        Object.values(TIER_CONFIG).flatMap((c) => [c.lookupKey, c.overageBytesLookupKey, c.overageSignalRunsLookupKey])
      );
      const hasRelevantLine = invoice.lines.data.some((line) => {
        const priceObj = line.pricing?.price_details?.price;
        const lookupKey = typeof priceObj === "object" && priceObj ? priceObj.lookup_key : null;
        return lookupKey && knownLookupKeys.has(lookupKey);
      });
      if (!hasRelevantLine) break;

      const workspaceId = invoice.parent.subscription_details?.metadata?.workspaceId;
      if (!workspaceId) {
        console.log("invoice.finalized: no workspaceId in subscription metadata");
        break;
      }

      // Use the period.start of the first subscription item line as the new resetTime
      const subscriptionLine = invoice.lines.data.find((l) => l.parent?.type === "subscription_item_details");
      const newResetTime = subscriptionLine?.period?.start;
      if (!newResetTime) {
        console.log("invoice.finalized: no subscription line period start found");
        break;
      }

      await handleInvoiceFinalized(workspaceId, newResetTime);
      break;
    }
    case "customer.subscription.deleted":
      await handleSubscriptionChange(event, true);
      break;
    case "customer.subscription.created":
      await handleSubscriptionChange(event);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionChange(event);
      break;
    default:
      // Unexpected event type
      // console.log(`Stripe Webhook. Unhandled event type ${event.type}.`);
      break;
  }
  return new Response("Webhook received.", { status: 200 });
}
