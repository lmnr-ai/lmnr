import { type NextRequest } from "next/server";
import stripe from "stripe";

import { handleSubscriptionChange, type ItemDescription, LOOKUP_KEY_TO_TIER_NAME } from "@/lib/checkout/utils";
import { sendOnPaymentFailedEmail, sendOnPaymentReceivedEmail } from "@/lib/emails/utils";

export async function POST(req: NextRequest): Promise<Response> {
  let event;
  const endpointSecret = process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET;
  // Get the signature sent by Stripe
  const signature = req.headers.get("stripe-signature") as string;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, endpointSecret!);
  } catch (err: Error | any) {
    console.log(`⚠️  Webhook signature verification failed.`, err.message);
    return new Response("Webhook signature verification failed.", {
      status: 400,
    });
  }
  // Handle the event
  console.log(event.type);
  switch (event.type) {
    case "invoice.payment_succeeded": {
      const invoice = event.data.object;
      const itemDescriptions = invoice.lines.data.map((line) => {
        const productDescription = line.description ?? "";
        const lookupKey = line.price?.lookup_key ?? "hobby_monthly_2026_02";
        const shortDescription = LOOKUP_KEY_TO_TIER_NAME[lookupKey];
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
        const lookupKey = line.price?.lookup_key ?? "hobby_monthly_2026_02";
        const shortDescription = LOOKUP_KEY_TO_TIER_NAME[lookupKey];
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
