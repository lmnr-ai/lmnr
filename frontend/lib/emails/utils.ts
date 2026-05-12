import { Resend } from "resend";

import PaymentFailedEmail from "./payment-failed-email";
import SubscriptionUpdatedEmail from "./subscription-updated-email";
import WelcomeEmail from "./welcome-email";
import WorkspaceInviteEmail from "./workspace-invite";

const RESEND = new Resend(process.env.RESEND_API_KEY ?? "_RESEND_API_KEY_PLACEHOLDER");

// Hardcoded to the production top-level domain because all Laminar transactional
// emails are sent from *@lmnr.ai / *@mail.lmnr.ai; linking to a different TLD
// (or a self-hosted URL from FRONTEND_URL) degrades email deliverability.
const billingPortalUrl = (workspaceId: string) => `https://lmnr.ai/workspace/${workspaceId}?tab=billing`;

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
  });

  if (error) console.log(error);
}
