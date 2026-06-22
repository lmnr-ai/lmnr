import dotenv from "dotenv";
import Stripe from "stripe";

dotenv.config({
  path: ".env.local",
});

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY_LIVE!);

const PRICE_IDS = new Set([
  "price_1TMQCFJYTAzXsTvXIXgKplMN", // usage price from product A
  "price_1TMQFtJYTAzXsTvXh7xzeSir", // usage price from product B
]);

const DAYS = 15;
const since = Math.floor(Date.now() / 1000) - DAYS * 24 * 60 * 60;

async function sumUsageBilling() {
  let totalAmount = 0; // sum of line item amounts billed
  const perPrice: Record<string, { amount: number; count: number }> = {};
  const customerBreakdown: Record<string, number> = {};

  // Only look at paid/open finalized invoices (not drafts)
  for await (const invoice of stripe.invoices.list({
    created: { gte: since },
    status: "paid", // change to 'open' or remove filter to include unpaid
    limit: 100, // stripe auto-paginates with for-await
  })) {
    if (invoice.id === "in_1Td6ckJYTAzXsTvXDAXPn9qJ") continue;
    if (invoice.id === "in_1Tc2w7JYTAzXsTvX7kZtsEtG") continue;
    for (const line of invoice.lines.data) {
      if (line.pricing?.price_details?.price && PRICE_IDS.has(line.pricing.price_details.price.toString())) {
        const priceId = line.pricing.price_details.price.toString();
        totalAmount += line.amount;

        perPrice[priceId] ??= { amount: 0, count: 0 };
        perPrice[priceId].amount += line.amount;
        perPrice[priceId].count += 1;

        const cid = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? "unknown");
        customerBreakdown[cid] = (customerBreakdown[cid] ?? 0) + line.amount;
      }
    }
  }

  const fmt = (n: number) => `$${(n / 100).toFixed(2)}`;

  console.log(`\n=== Usage Billing Summary (last ${DAYS} days) ===`);
  console.log(`Total billed across both prices: ${fmt(totalAmount)}`);
  console.log("\nPer-price breakdown:");
  for (const [priceId, { amount, count }] of Object.entries(perPrice)) {
    console.log(`  ${priceId}: ${fmt(amount)} across ${count} invoice line items`);
  }
  console.log(`\nUnique customers billed: ${Object.keys(customerBreakdown).length}`);
}

sumUsageBilling().catch(console.error);
