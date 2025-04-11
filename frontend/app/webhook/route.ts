import { type NextRequest } from 'next/server';
import stripe from 'stripe';

import {
  getIdFromStripeObject,
  isLookupKeyForAdditionalSeats,
  ItemDescription,
  LOOKUP_KEY_TO_TIER_NAME,
  manageUserSubscriptionEvent,
  manageWorkspaceSubscriptionEvent
} from '@/lib/checkout/utils';
import { sendOnPaymentReceivedEmail } from '@/lib/emails/utils';

async function sendEmailOnInvoiceReceived(
  itemDescriptions: ItemDescription[],
  email: string,
) {
  // set date as the current date
  // TODO: use the date from the invoice
  const date = new Date().toLocaleDateString();
  sendOnPaymentReceivedEmail(email, itemDescriptions, date);

}

type SubscriptionEvent = stripe.CustomerSubscriptionUpdatedEvent
  | stripe.CustomerSubscriptionDeletedEvent
  | stripe.CustomerSubscriptionCreatedEvent;
async function handleSubscriptionChange(
  event: SubscriptionEvent,
  cancel: boolean = false
) {
  const subscription = event.data.object;
  const status = subscription.status;
  if (['past_due', 'unpaid', 'paused'].includes(status)) {
    // https://docs.stripe.com/customer-management/integrate-customer-portal#webhooks
    // this does not include `canceled` status, because if `cancel_at_period_end` is set,
    // the subscription will not be canceled immediately and the `deleted` event will be sent eventually.
    console.log(`Subscription ${subscription.id} status changed to`, status);
    return;
  }
  for (const subscriptionItem of subscription.items.data) {
    if (!subscriptionItem.plan.product) {
      console.log(
        `subscription updated event. No product found. subscriptionItem: ${subscriptionItem}`
      );
      continue;
    }
    const stripeCustomerId = getIdFromStripeObject(subscription.customer);
    const productId = getIdFromStripeObject(subscriptionItem.plan.product);
    const subscriptionType = subscription.metadata?.type ?? 'workspace';
    const workspaceId = subscription.metadata?.workspaceId;
    const userId = subscription.metadata?.userId;

    if (!stripeCustomerId) {
      console.log(`subscription updated event. No stripeCustomerId found.`);
      continue;
    }
    if (!productId) {
      console.log(`subscription updated event. No productId found.`);
      continue;
    }
    if (cancel) {
      console.log(
        `Subscription ${subscription.id} canceled. productId`,
        productId
      );
      if (subscriptionType === 'workspace') {
        await manageWorkspaceSubscriptionEvent({
          stripeCustomerId,
          productId,
          workspaceId,
          subscriptionId: subscription.id,
          quantity: subscriptionItem.quantity,
          cancel: true
        });
      } else {
        await manageUserSubscriptionEvent({
          stripeCustomerId,
          productId,
          userId,
          subscriptionId: subscription.id,
          cancel: true
        });
      }
      return;
    }

    const lookupKey = subscriptionItem.price.lookup_key;
    console.log(`lookupKey`, lookupKey);
    const isAdditionalSeats = isLookupKeyForAdditionalSeats(lookupKey);
    console.log(`isAdditionalSeats`, isAdditionalSeats);
    if (status === 'active' && stripeCustomerId && productId) {
      console.log(`Subscription ${subscription.id} active. productId`, productId);
      try {
        if (subscriptionType === 'workspace') {
          await manageWorkspaceSubscriptionEvent({
            stripeCustomerId,
            productId,
            workspaceId,
            subscriptionId: subscription.id,
            quantity: subscriptionItem.quantity,
            isAdditionalSeats
          });
        } else {
          await manageUserSubscriptionEvent({
            stripeCustomerId,
            productId,
            userId,
            subscriptionId: subscription.id,
          });
        }
      } catch (error) {
        console.error(`Error managing subscription event`, error);
        // Rethrow, so that the webhook is not marked as successful
        throw error;
      }
    }
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  let event;
  const endpointSecret = process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET;
  // Get the signature sent by Stripe
  const signature = req.headers.get('stripe-signature') as string;
  try {
    event = stripe.webhooks.constructEvent(
      await req.text(),
      signature,
      endpointSecret!
    );
  } catch (err: Error | any) {
    console.log(`⚠️  Webhook signature verification failed.`, err.message);
    return new Response('Webhook signature verification failed.', {
      status: 400
    });
  }
  // Handle the event
  console.log(event.type);
  switch (event.type) {
    case 'invoice.payment_succeeded':
      const invoice = event.data.object;
      const itemDescriptions = invoice.lines.data.map((line) => {
        const productDescription = line.description ?? '';
        const lookupKey = line.price?.lookup_key ?? 'hobby_monthly_2025_04';
        const shortDescription = LOOKUP_KEY_TO_TIER_NAME[lookupKey];
        return {
          productDescription,
          quantity: line.quantity,
          shortDescription
        } as ItemDescription;
      });
      const customerEmail = invoice.customer_email;
      if (customerEmail) {
        await sendEmailOnInvoiceReceived(
          itemDescriptions,
          customerEmail
        );
      }
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionChange(event, true);
      break;
    case 'customer.subscription.created':
      handleSubscriptionChange(event);
      break;
    case 'customer.subscription.updated':
      handleSubscriptionChange(event);
      break;
    default:
      // Unexpected event type
      // console.log(`Stripe Webhook. Unhandled event type ${event.type}.`);
      break;
  }
  return new Response('Webhook received.', { status: 200 });
}
