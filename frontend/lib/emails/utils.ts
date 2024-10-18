import { Resend } from 'resend';
import SubscriptionUpdatedEmail from './subscription-updated-email';
import WelcomeEmail from './welcome-email';

const RESEND = new Resend(
  process.env.RESEND_API_KEY ?? '_RESEND_API_KEY_PLACEHOLDER'
);

export async function sendWelcomeEmail(email: string) {
  const from = 'Robert Kim <robert@lmnr.ai>';
  const subject = 'Welcome to Laminar!';

  const { data, error } = await RESEND.emails.send({
    from,
    to: [email],
    subject,
    react: WelcomeEmail({})
  });

  if (error) console.log(error);
}

export async function sendOnPaymentReceivedEmail(
  email: string,
  productDescription: string,
  date: string,
  shortDescription?: string
) {
  const from = 'Laminar team <founders@lmnr.ai>';
  const subject = `Laminar: Payment for ${shortDescription ?? productDescription} is received.`;
  const component = SubscriptionUpdatedEmail({
    productDescription,
    date,
    billedTo: email,
    shortDescription
  });

  const { data, error } = await RESEND.emails.send({
    from,
    to: [email],
    subject,
    react: component
  });

  if (error) console.log(error);
}
