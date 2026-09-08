import { readFile } from "node:fs/promises";
import path from "node:path";

import { Resend } from "resend";

import PaymentFailedEmail from "./payment-failed-email";
import { REPORT_LOGO_CID } from "./report-email-layout";
import SubscriptionUpdatedEmail from "./subscription-updated-email";
import WelcomeEmail from "./welcome-email";
import WorkspaceInviteEmail from "./workspace-invite";

const RESEND = new Resend(process.env.RESEND_API_KEY ?? "_RESEND_API_KEY_PLACEHOLDER");

// Hardcoded to the production top-level domain because all Laminar transactional
// emails are sent from *@lmnr.ai / *@mail.lmnr.ai; linking to a different TLD
// (or a self-hosted URL from FRONTEND_URL) degrades email deliverability.
// /checkout/portal mints a Stripe billing portal session and redirects, so the
// user lands directly on the Stripe-hosted billing portal (with invoices) instead
// of having to navigate workspace settings → billing → "Billing portal".
const billingPortalUrl = (workspaceId: string) =>
  `https://lmnr.ai/checkout/portal?workspaceId=${encodeURIComponent(workspaceId)}`;

const reportLogoAttachment = async () => ({
  content: await readFile(path.join(process.cwd(), "public", "report-logo.png")),
  filename: "report-logo.png",
  contentId: REPORT_LOGO_CID,
});

interface InvoiceEmailArgs {
  email: string;
  workspaceId: string;
  total: string;
  date: string;
}

export async function sendWelcomeEmail(email: string) {
  const from = "Robert from Laminar <robert@lmnr.ai>";
  const subject = "Welcome to Laminar!";

  const { data, error } = await RESEND.emails.send({
    from,
    to: [email],
    subject,
    react: WelcomeEmail(),
  });

  if (error) console.log(error);
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
    attachments: [await reportLogoAttachment()],
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
    attachments: [await reportLogoAttachment()],
  });

  if (error) console.error(error);
}

export async function sendInvitationEmail(email: string, workspaceName: string, inviteLink: string) {
  const from = "Robert from Laminar <robert@lmnr.ai>";
  const subject = `You are invited to join ${workspaceName} on Laminar`;

  const { data, error } = await RESEND.emails.send({
    from,
    to: [email],
    subject,
    react: WorkspaceInviteEmail({ workspaceName, inviteLink }),
    attachments: [await reportLogoAttachment()],
  });

  if (error) console.log(error);
}
