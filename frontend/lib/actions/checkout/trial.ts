import { and, eq, isNotNull, isNull, ne, or } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod/v4";

import { getOrCreateStripeCustomer } from "@/lib/actions/checkout/customer";
import { stripe } from "@/lib/actions/checkout/stripe";
import { captureTrialEvent, type TrialSource } from "@/lib/actions/checkout/trial-analytics";
import {
  getIdFromStripeObject,
  handleInvoiceFinalized,
  manageWorkspaceSubscriptionEvent,
} from "@/lib/actions/checkout/webhook";
import { invalidateProjectCacheForWorkspace } from "@/lib/actions/usage/utils";
import { checkUserWorkspaceRole } from "@/lib/actions/workspace/utils";
import { getServerSession } from "@/lib/auth-session";
import { invalidateWorkspaceMemberAccessCache } from "@/lib/authorization";
import { normalizeTier } from "@/lib/billing/tiers";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, users, workspaces } from "@/lib/db/migrations/schema";
import { sendTrialEndingEmail } from "@/lib/emails/utils";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

import { TIER_CONFIG, TRIAL_DAYS } from "./types";

// "canceled" also covers an expiry: both put the workspace back on Free.
type TrialOutcome = "converted" | "canceled";

const StartTrialSchema = z.object({
  workspaceId: z.guid(),
  source: z.enum(["onboarding", "billing"] satisfies TrialSource[]),
});

const TrialPaymentSchema = z.object({
  workspaceId: z.guid(),
  returnUrl: z.url(),
});

// Marks Checkout sessions created by getTrialPaymentUrl for the checkout.session.completed handler.
export const TRIAL_PAYMENT_SESSION_TYPE = "trial_payment";

// `workspaces.trial_ends_at` is set only while a trial runs; Stripe keeps the trial's history.
export const getActiveTrial = async (
  workspaceId: string
): Promise<{ endsAt: string; subscriptionId: string } | null> => {
  const workspace = await db.query.workspaces.findFirst({
    where: and(eq(workspaces.id, workspaceId), isNotNull(workspaces.trialEndsAt)),
    columns: { trialEndsAt: true, subscriptionId: true },
  });
  if (!workspace?.trialEndsAt || !workspace.subscriptionId) return null;
  return { endsAt: workspace.trialEndsAt, subscriptionId: workspace.subscriptionId };
};

// A trial sets subscription_id and it is never cleared, so "never subscribed" covers both
// "this workspace never had a trial" and "this user never owned one that did".
const ownsSubscribedWorkspace = async (userId: string): Promise<boolean> => {
  const [row] = await db
    .select({ id: workspaces.id })
    .from(membersOfWorkspaces)
    .innerJoin(workspaces, eq(workspaces.id, membersOfWorkspaces.workspaceId))
    .where(
      and(
        eq(membersOfWorkspaces.userId, userId),
        eq(membersOfWorkspaces.memberRole, "owner"),
        isNotNull(workspaces.subscriptionId)
      )
    )
    .limit(1);
  return !!row;
};

// Without a workspace (onboarding before it is created) only the per-user rule applies.
export const isStarterTrialEligible = async (workspaceId: string | null, userId: string): Promise<boolean> => {
  if (!isFeatureEnabled(Feature.SUBSCRIPTION)) return false;

  if (workspaceId) {
    const workspace = await db.query.workspaces.findFirst({
      where: and(eq(workspaces.id, workspaceId), isNull(workspaces.subscriptionId)),
      with: { subscriptionTier: true },
    });
    if (!workspace || normalizeTier(workspace.subscriptionTier.name) !== "free") return false;
  }

  return !(await ownsSubscribedWorkspace(userId));
};

export const getWorkspaceOwnerEmails = async (workspaceId: string): Promise<string[]> => {
  const owners = await db
    .select({ email: users.email })
    .from(membersOfWorkspaces)
    .innerJoin(users, eq(users.id, membersOfWorkspaces.userId))
    .where(and(eq(membersOfWorkspaces.workspaceId, workspaceId), eq(membersOfWorkspaces.memberRole, "owner")));
  return owners.map((o) => o.email);
};

export const startStarterTrial = async (input: z.infer<typeof StartTrialSchema>): Promise<{ endsAt: string }> => {
  const { workspaceId, source } = StartTrialSchema.parse(input);
  // Owner only: eligibility is one trial per owner, and the trial bills the caller's Stripe customer.
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner"] });

  const session = (await getServerSession())!;
  if (!(await isStarterTrialEligible(workspaceId, session.user.id))) {
    throw new Error("This workspace is not eligible for a free trial.");
  }

  const workspace = (await db.query.workspaces.findFirst({ where: eq(workspaces.id, workspaceId) }))!;
  const { customerId } = await getOrCreateStripeCustomer(session.user.email!);

  const s = stripe();
  const prices = await s.prices.list({ lookup_keys: [TIER_CONFIG.hobby.lookupKey] });
  const flatPrice = prices.data.find((p) => p.lookup_key === TIER_CONFIG.hobby.lookupKey);
  if (!flatPrice) {
    throw new Error("Could not resolve Starter price in Stripe");
  }

  // Overage prices are attached only on conversion: a card-less trial must never accrue metered charges.
  const subscription = await s.subscriptions.create(
    {
      customer: customerId,
      items: [{ price: flatPrice.id, quantity: 1 }],
      trial_period_days: TRIAL_DAYS,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      payment_settings: { save_default_payment_method: "on_subscription" },
      metadata: { workspaceId, workspaceName: workspace.name, type: "workspace", trialSource: source },
    },
    { idempotencyKey: `starter-trial-${workspaceId}` }
  );

  const endsAt = new Date((subscription.trial_end ?? 0) * 1000).toISOString();
  await db.update(workspaces).set({ trialEndsAt: endsAt }).where(eq(workspaces.id, workspaceId));

  // Applied here as well as in the webhook so the tier flips before Stripe calls back; both are idempotent.
  await manageWorkspaceSubscriptionEvent({
    stripeCustomerId: customerId,
    productId: typeof flatPrice.product === "string" ? flatPrice.product : flatPrice.product.id,
    workspaceId,
    subscriptionId: subscription.id,
  });

  return { endsAt };
};

// Clears the trial once. Returns false when it was already over, so webhook retries don't
// repeat side effects.
export const endTrial = async (workspaceId: string, outcome: TrialOutcome): Promise<boolean> => {
  const [ended] = await db
    .update(workspaces)
    .set({ trialEndsAt: null })
    .where(and(eq(workspaces.id, workspaceId), isNotNull(workspaces.trialEndsAt)))
    .returning({ id: workspaces.id });
  if (!ended) return false;

  // The cached project billing info carries `trialing`, which gates the caps.
  await invalidateProjectCacheForWorkspace(workspaceId);
  if (outcome !== "converted") {
    // Back on Free: non-owners lose access.
    await invalidateWorkspaceMemberAccessCache(workspaceId);
  }
  return true;
};

export const trackTrialStarted = async (subscription: Stripe.Subscription) => {
  if (subscription.status !== "trialing" || !subscription.trial_end) return;
  captureTrialEvent(subscription, "started", {
    // Absent on trials created outside the app (the backfill script, the Stripe dashboard).
    source: subscription.metadata?.trialSource ?? "other",
    trial_ends_at: new Date(subscription.trial_end * 1000).toISOString(),
  });
};

// The webhook is the source of truth for the end date: it covers a crash between creating the
// subscription and saving the date in startStarterTrial, and a trial_end changed in Stripe.
export const syncTrialEndFromSubscription = async (subscription: Stripe.Subscription) => {
  const workspaceId = subscription.metadata?.workspaceId;
  if (subscription.status !== "trialing" || !workspaceId || !subscription.trial_end) return;
  const endsAt = new Date(subscription.trial_end * 1000).toISOString();
  const [updated] = await db
    .update(workspaces)
    .set({ trialEndsAt: endsAt })
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.subscriptionId, subscription.id),
        or(isNull(workspaces.trialEndsAt), ne(workspaces.trialEndsAt, endsAt))
      )
    )
    .returning({ id: workspaces.id });
  if (updated) await invalidateProjectCacheForWorkspace(workspaceId);
};

export const subscriptionHasPaymentMethod = async (subscription: Stripe.Subscription): Promise<boolean> => {
  if (subscription.default_payment_method) return true;
  const customerId = getIdFromStripeObject(subscription.customer);
  if (!customerId) return false;
  const customer = await stripe().customers.retrieve(customerId);
  return !customer.deleted && !!customer.invoice_settings?.default_payment_method;
};

export const getTrialSubscription = async (workspaceId: string): Promise<Stripe.Subscription | null> => {
  const trial = await getActiveTrial(workspaceId);
  if (!trial) return null;
  return stripe().subscriptions.retrieve(trial.subscriptionId);
};

// Readable by any member, unlike getSubscriptionDetails: the sidebar trial card shows it to everyone.
export const trialConvertsToPaid = async (workspaceId: string): Promise<boolean | null> => {
  const subscription = await getTrialSubscription(workspaceId);
  if (!subscription) return null;
  return !subscription.cancel_at_period_end && (await subscriptionHasPaymentMethod(subscription));
};

const requireTrialSubscription = async (workspaceId: string): Promise<Stripe.Subscription> => {
  await checkUserWorkspaceRole({ workspaceId, roles: ["owner", "admin"] });
  const subscription = await getTrialSubscription(workspaceId);
  if (!subscription) {
    throw new Error("This workspace has no active trial.");
  }
  return subscription;
};

// Stripe setup-mode Checkout: saves a card on the trial, which then converts at trial end.
export const getTrialPaymentUrl = async (input: z.input<typeof TrialPaymentSchema>): Promise<string> => {
  const { workspaceId, returnUrl } = TrialPaymentSchema.parse(input);
  const subscription = await requireTrialSubscription(workspaceId);
  const session = await stripe().checkout.sessions.create({
    mode: "setup",
    currency: "usd",
    customer: getIdFromStripeObject(subscription.customer),
    metadata: { type: TRIAL_PAYMENT_SESSION_TYPE, workspaceId, subscriptionId: subscription.id },
    success_url: returnUrl,
    cancel_url: returnUrl,
  });
  return session.url!;
};

// "Cancel subscription": Stripe cancels at trial_end and the deleted webhook moves the workspace to Free.
export const setTrialContinues = async (workspaceId: string, continues: boolean): Promise<void> => {
  const subscription = await requireTrialSubscription(workspaceId);
  await stripe().subscriptions.update(subscription.id, { cancel_at_period_end: !continues });
};

// Ends the trial today; Stripe invoices and the conversion webhook runs.
export const startStarterNow = async (workspaceId: string): Promise<void> => {
  const subscription = await requireTrialSubscription(workspaceId);
  if (!(await subscriptionHasPaymentMethod(subscription))) {
    throw new Error("Add a payment method first.");
  }
  await stripe().subscriptions.update(subscription.id, { trial_end: "now", cancel_at_period_end: false });
};

export const handleTrialPaymentSessionCompleted = async (session: Stripe.Checkout.Session) => {
  const subscriptionId = session.metadata?.subscriptionId;
  const setupIntentId = getIdFromStripeObject(session.setup_intent);
  if (!subscriptionId || !setupIntentId) return;

  const s = stripe();
  const setupIntent = await s.setupIntents.retrieve(setupIntentId);
  const paymentMethodId = getIdFromStripeObject(setupIntent.payment_method);
  if (!paymentMethodId) return;

  const customerId = getIdFromStripeObject(session.customer);
  if (customerId) {
    await s.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
  }
  // Adding a card also undoes an earlier "Cancel subscription".
  const subscription = await s.subscriptions.update(subscriptionId, {
    default_payment_method: paymentMethodId,
    cancel_at_period_end: false,
  });
  captureTrialEvent(subscription, "card_added");
};

// An active subscription on a still-trialing workspace has converted, whether straight from
// trialing or after a declined day-14 charge was retried. The trial is cleared last so a failed
// step is redone on webhook retry.
export const handleTrialConversion = async (
  subscription: Stripe.Subscription,
  attachOveragePrices: (subscription: Stripe.Subscription) => Promise<void>
) => {
  const workspaceId = subscription.metadata?.workspaceId;
  if (subscription.status !== "active" || !workspaceId) return;
  const trial = await getActiveTrial(workspaceId);
  if (trial?.subscriptionId !== subscription.id) return;

  await attachOveragePrices(subscription);
  // The first paid invoice carries only the flat price, so invoice.finalized never resets usage for it.
  const periodStart = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  await handleInvoiceFinalized(workspaceId, true, true, periodStart);
  if (await endTrial(workspaceId, "converted")) {
    const trialDays =
      subscription.trial_start && subscription.trial_end
        ? Math.round((subscription.trial_end - subscription.trial_start) / 86400)
        : null;
    // Fewer days than TRIAL_DAYS means the owner clicked Start now.
    captureTrialEvent(subscription, "converted", { trial_days: trialDays });
  }
};

// No-op unless this was a still-running trial (Stripe cancels card-less trials at the end).
export const handleTrialDeleted = async (subscription: Stripe.Subscription) => {
  const workspaceId = subscription.metadata?.workspaceId;
  if (!workspaceId || !(await endTrial(workspaceId, "canceled"))) return;
  const reason = subscription.cancel_at_period_end
    ? "canceled"
    : subscription.cancellation_details?.reason === "payment_failed"
      ? "payment_failed"
      : "expired";
  captureTrialEvent(subscription, "ended", { reason });
};

// Fires 3 days before the end, or right away when a trial is cut short. Only trials that won't
// convert on their own (no card, or "Cancel subscription") get the reminder.
export const handleTrialWillEnd = async (subscription: Stripe.Subscription) => {
  const workspaceId = subscription.metadata?.workspaceId;
  if (subscription.status !== "trialing" || !workspaceId || !subscription.trial_end) return;
  const trial = await getActiveTrial(workspaceId);
  if (trial?.subscriptionId !== subscription.id) return;
  if (!subscription.cancel_at_period_end && (await subscriptionHasPaymentMethod(subscription))) return;

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
    columns: { name: true },
  });
  await sendTrialEndingEmail({
    to: await getWorkspaceOwnerEmails(workspaceId),
    workspaceId,
    workspaceName: workspace?.name ?? "Your workspace",
    endsAt: new Date(subscription.trial_end * 1000),
  });
};
