import { readFile } from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";

import { projectHasTraces } from "@/lib/actions/project/has-traces";
import { db } from "@/lib/db/drizzle";
import { projects, workspaces } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

import { sendUserOnboardedEvent } from "./automations";
import { RESEND } from "./client";
import PaymentFailedEmail from "./payment-failed-email";
import { LAMINAR_LOGO_CID } from "./report-email-layout";
import SubscriptionUpdatedEmail from "./subscription-updated-email";
import TrialEndingEmail from "./trial-ending-email";
import WelcomeEmail from "./welcome-email";
import WorkspaceInviteEmail from "./workspace-invite";

// Hardcoded to the production top-level domain because all Laminar transactional
// emails are sent from *@lmnr.ai / *@mail.lmnr.ai; linking to a different TLD
// (or a self-hosted URL from FRONTEND_URL) degrades email deliverability.
// /checkout/portal mints a Stripe billing portal session and redirects, so the
// user lands directly on the Stripe-hosted billing portal (with invoices) instead
// of having to navigate workspace settings → billing → "Billing portal".
const billingPortalUrl = (workspaceId: string) =>
  `https://lmnr.ai/checkout/portal?workspaceId=${encodeURIComponent(workspaceId)}`;

// Lands on Stripe setup Checkout while the trial runs, else on the workspace billing tab.
const trialPaymentUrl = (workspaceId: string) =>
  `https://lmnr.ai/checkout/trial-payment?workspaceId=${encodeURIComponent(workspaceId)}`;

const formatEmailDate = (date: Date) =>
  date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

const laminarLogoAttachment = async () => ({
  content: await readFile(path.join(process.cwd(), "public", "laminar-logo-sm.png")),
  filename: "laminar-logo-sm.png",
  contentId: LAMINAR_LOGO_CID,
});

interface InvoiceEmailArgs {
  email: string;
  workspaceId: string;
  total: string;
  date: string;
}

// `projectId` is the project the user was onboarded into; the follow-up automation
// (USER_ONBOARDED_EVENT) nudges them until that project receives its first trace.
export async function sendWelcomeEmail(email: string, projectId: string) {
  const from = "Robert from Laminar <robert@mail.lmnr.ai>";
  const [workspace] = await db
    .select({ id: workspaces.id, trialEndsAt: workspaces.trialEndsAt })
    .from(projects)
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .where(eq(projects.id, projectId))
    .limit(1);
  const trial = workspace?.trialEndsAt
    ? { endsOn: formatEmailDate(new Date(workspace.trialEndsAt)), addPaymentUrl: trialPaymentUrl(workspace.id) }
    : undefined;
  const subject = trial ? "Welcome to Laminar! Your Starter trial has started" : "Welcome to Laminar!";

  const { data, error } = await RESEND.emails.send({
    from,
    to: [email],
    subject,
    react: WelcomeEmail({ trial }),
    attachments: [await laminarLogoAttachment()],
  });

  if (error) {
    console.log(error);
    return;
  }

  // Checked here because onboarding can finish after traces arrived but before anyone
  // opened the traces page, so the PROJECT_HAS_TRACES_EVENT would come too late.
  if (isFeatureEnabled(Feature.EMAIL_AUTOMATIONS)) {
    // A failed lookup reports false: if traces do exist, the later PROJECT_HAS_TRACES_EVENT
    // still ends the sequence, whereas true would end it for good.
    const hasTraces = (await projectHasTraces(projectId)) === true;
    await sendUserOnboardedEvent({ email, projectId, hasTraces });
  }
}

export async function sendOnPaymentReceivedEmail({ email, workspaceId, total, date }: InvoiceEmailArgs) {
  const from = "Laminar team <founders@lmnr.ai>";
  const subject = `Laminar: Payment of ${total} received.`;
  const component = SubscriptionUpdatedEmail({
    total,
    date,
    billedTo: email,
    billingPortalUrl: billingPortalUrl(workspaceId),
  });

  const { data, error } = await RESEND.emails.send({
    from,
    to: [email],
    subject,
    react: component,
    attachments: [await laminarLogoAttachment()],
  });

  if (error) console.error(error);
}

export async function sendOnPaymentFailedEmail({ email, workspaceId, total, date }: InvoiceEmailArgs) {
  const from = "Laminar team <founders@lmnr.ai>";
  const subject = `Laminar: Payment of ${total} failed.`;
  const component = PaymentFailedEmail({
    total,
    date,
    billedTo: email,
    billingPortalUrl: billingPortalUrl(workspaceId),
  });

  const { data, error } = await RESEND.emails.send({
    from,
    to: [email],
    subject,
    react: component,
    attachments: [await laminarLogoAttachment()],
  });

  if (error) console.error(error);
}

export async function sendInvitationEmail(email: string, workspaceName: string, inviteLink: string) {
  const from = "Robert from Laminar <robert@mail.lmnr.ai>";
  const subject = `You are invited to join ${workspaceName} on Laminar`;

  const { data, error } = await RESEND.emails.send({
    from,
    to: [email],
    subject,
    react: WorkspaceInviteEmail({ workspaceName, inviteLink }),
    attachments: [await laminarLogoAttachment()],
  });

  if (error) console.log(error);
}

export async function sendTrialEndingEmail({
  to,
  workspaceId,
  workspaceName,
  endsAt,
}: {
  to: string[];
  workspaceId: string;
  workspaceName: string;
  endsAt: Date;
}) {
  if (!isFeatureEnabled(Feature.SEND_EMAIL) || to.length === 0) return;

  const endsOn = formatEmailDate(endsAt);
  const { error } = await RESEND.emails.send({
    from: "Laminar team <founders@lmnr.ai>",
    to,
    subject: `Your Laminar Starter trial for ${workspaceName} ends on ${endsOn}`,
    react: TrialEndingEmail({ workspaceName, endsOn, addPaymentUrl: trialPaymentUrl(workspaceId) }),
    attachments: [await laminarLogoAttachment()],
  });

  if (error) console.error(error);
}
