import { config } from "dotenv";
import Stripe from "stripe";

config({
  path: ".env.local",
});

const s = new Stripe(process.env.STRIPE_SECRET_KEY!);

const main = async () =>
  await s.v2.billing.meterEvents.create({
    event_name: "2026_03_overage_megabytes",
    payload: {
      stripe_customer_id: "cus_U0u6waAAumkF8D",
      megabytes: "-486263",
    },
    identifier: "test" + new Date().toISOString(),
  });

main().catch(console.log);
