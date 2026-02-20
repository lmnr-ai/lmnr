import Stripe from "stripe";

export function stripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}
