import { Resend } from 'resend';
import SubscriptionUpdatedEmail from './subscription-updated-email';
import WelcomeEmail from './welcome-email';
import { ItemDescription } from '../checkout/utils';

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
  itemDescriptions: ItemDescription[],
  date: string,
) {
  const from = 'Laminar team <founders@lmnr.ai>';
  const subject = itemDescriptions.length === 1 ?
    `Laminar: Payment for ${itemDescriptions[0].shortDescription ?? itemDescriptions[0].productDescription} is received.` :
    'Laminar: Payment received.';
  const component = SubscriptionUpdatedEmail({
    itemDescriptions,
    date,
    billedTo: email,
  });

  const { data, error } = await RESEND.emails.send({
    from,
    to: [email],
    subject,
    react: component
  });

  if (error) console.log(error);
}
