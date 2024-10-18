import {
  LOOKUP_KEY_TO_TIER_NAME,
  getIdFromStripeObject,
  manageSubscriptionEvent
} from '@/lib/checkout/utils';
import { sendOnPaymentReceivedEmail } from '@/lib/emails/utils';
import { type NextRequest } from 'next/server';
import stripe from 'stripe';

async function sendEmailOnInvoiceReceived(
  lookupKey: string,
  description: string,
  stripeCustomerId: string
) {
  const res = await fetch(
    `${process.env.BACKEND_URL}/api/v1/users/stripe_customers/${stripeCustomerId}`,
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
  const user = await res.json();
  const email = user.email;

  // set date as the current date
  const date = new Date().toLocaleDateString();

  const shortDescription = LOOKUP_KEY_TO_TIER_NAME[lookupKey];

  sendOnPaymentReceivedEmail(email, description, date, shortDescription);
}

type SubscriptionEvent =
  | stripe.CustomerSubscriptionUpdatedEvent
  | stripe.CustomerSubscriptionDeletedEvent
  | stripe.CustomerSubscriptionCreatedEvent;
async function handleSubscriptionChange(
  event: SubscriptionEvent,
  cancel: boolean = false
) {
  const subscription = event.data.object;
  const status = subscription.status;
  const subscriptionItem = event.data.object.items.data[0];
  if (!subscriptionItem.plan.product) {
    console.log(
      `subscription updated event. No product found. subscriptionItem: ${subscriptionItem}`
    );
    return;
  }
  const stripeCustomerId = getIdFromStripeObject(subscription.customer);
  const productId = getIdFromStripeObject(subscriptionItem.plan.product);
  const workspaceId = subscription.metadata.workspaceId;
  if (!stripeCustomerId) {
    console.log(`subscription updated event. No stripeCustomerId found.`);
    return;
  }
  if (!productId) {
    console.log(`subscription updated event. No productId found.`);
    return;
  }

  if (cancel) {
    console.log(
      `Subscription ${subscription.id} canceled. productId`,
      subscriptionItem.plan.product
    );
    await manageSubscriptionEvent(
      stripeCustomerId,
      productId,
      workspaceId,
      subscriptionItem.quantity,
      true
    );
    return;
  }

  if (status === 'active' && stripeCustomerId && productId) {
    console.log(
      `Subscription ${subscription.id} active. productId`,
      subscriptionItem.plan.product
    );
    await manageSubscriptionEvent(
      stripeCustomerId,
      productId,
      workspaceId,
      subscriptionItem.quantity
    );

    if (['past_due', 'unpaid', 'paused'].includes(status)) {
      // https://docs.stripe.com/customer-management/integrate-customer-portal#webhooks
      // this does not include `canceled` status, because if `cancel_at_period_end` is set,
      // the subscription will not be canceled immediately and the `deleted` event will be sent eventually.
      console.log(`Subscription ${subscription.id} status changed to`, status);
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
    const lookupKey =
        invoice.lines.data[0].price?.lookup_key ?? 'pro_monthly_2024_09';
    const productDescription = invoice.lines.data[0].description;
    const stripeCustomerId = getIdFromStripeObject(invoice.customer);
    if (stripeCustomerId) {
      await sendEmailOnInvoiceReceived(
        lookupKey,
        productDescription ?? '',
        stripeCustomerId
      );
    }
    break;
  case 'customer.subscription.deleted':
    await handleSubscriptionChange(event, true);
    break;
    // Then define and call a method to handle the subscription deleted.
    // handleSubscriptionDeleted(subscriptionDeleted);
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
