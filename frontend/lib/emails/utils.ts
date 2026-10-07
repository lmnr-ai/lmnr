import { readFile } from "node:fs/promises";
import path from "node:path";

import { projectHasTraces } from "@/lib/actions/project/has-traces";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

import { sendUserOnboardedEvent } from "./automations";
import { RESEND } from "./client";
import PaymentFailedEmail from "./payment-failed-email";
import { LAMINAR_LOGO_CID } from "./report-email-layout";
import SubscriptionUpdatedEmail from "./subscription-updated-email";
import WelcomeEmail, { WELCOME_BANNER_CID } from "./welcome-email";
import WorkspaceInviteEmail from "./workspace-invite";

// Hardcoded to the production top-level domain because all Laminar transactional
// emails are sent from *@lmnr.ai / *@mail.lmnr.ai; linking to a different TLD
// (or a self-hosted URL from FRONTEND_URL) degrades email deliverability.
// /checkout/portal mints a Stripe billing portal session and redirects, so the
// user lands directly on the Stripe-hosted billing portal (with invoices) instead
// of having to navigate workspace settings → billing → "Billing portal".
const billingPortalUrl = (workspaceId: string) =>
  `https://lmnr.ai/checkout/portal?workspaceId=${encodeURIComponent(workspaceId)}`;

const laminarLogoAttachment = async () => ({
  content: await readFile(path.join(process.cwd(), "public", "laminar-logo-sm.png")),
  filename: "laminar-logo-sm.png",
  contentId: LAMINAR_LOGO_CID,
});

const welcomeBannerAttachment = async () => ({
  content: await readFile(path.join(process.cwd(), "public", "welcome-banner-background.png")),
  filename: "welcome-banner-background.png",
  contentId: WELCOME_BANNER_CID,
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
  const subject = "Welcome to Laminar!";

  const { data, error } = await RESEND.emails.send({
    from,
    to: [email],
    subject,
    react: WelcomeEmail(),
    attachments: [await laminarLogoAttachment(), await welcomeBannerAttachment()],
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
    attachments: [await laminarLogoAttachment(), await welcomeBannerAttachment()],
  });

  if (error) console.log(error);
}
