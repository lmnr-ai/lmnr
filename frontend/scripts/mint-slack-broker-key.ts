// Mints a Slack broker instance key for a self-hosted customer.
//
// CLOUD ONLY. The row lives in Cloud's Postgres and is what authenticates that
// customer's instance at /api/broker/slack/start and /api/broker/slack/redeem.
// The customer sets the printed key as LMNR_LICENSE_KEY on their deployment.
//
//   pnpm slack:mint-broker-key "acme-corp"           dry run: report existing keys for the label
//   pnpm slack:mint-broker-key "acme-corp" --apply   mint, insert, print the key once
//
// Only the SHA3-256 hash is stored, so the key cannot be recovered afterwards —
// a lost key means deleting the row and minting a new one.
import { config } from "dotenv";
import { eq } from "drizzle-orm";

// Must load before importing @/lib/db/drizzle: the db singleton reads
// DATABASE_URL at import time, hence the dynamic imports in main().
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const apply = process.argv.includes("--apply");
  const label = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

  if (!label) {
    console.error('Usage: pnpm slack:mint-broker-key "<label>" [--apply]');
    console.error("The label is how we attribute a key later — use the customer's name.");
    process.exit(1);
  }

  const { generateRandomKey, hashApiKey } = await import("@/lib/api-keys.ts");
  const { db } = await import("@/lib/db/drizzle.ts");
  const { slackBrokerInstances } = await import("@/lib/db/migrations/schema.ts");

  const existing = await db
    .select({ id: slackBrokerInstances.id, createdAt: slackBrokerInstances.createdAt })
    .from(slackBrokerInstances)
    .where(eq(slackBrokerInstances.label, label));

  // Keys are independent, not versioned: minting a second one for a label leaves
  // the first working. Surface that so a rotation doesn't silently become two
  // live keys.
  if (existing.length > 0) {
    console.warn(`"${label}" already has ${existing.length} key(s):`);
    for (const row of existing) {
      console.warn(`  ${row.id}  created ${row.createdAt}`);
    }
    console.warn("Minting another leaves those working. Delete the old row if you are rotating.\n");
  }

  if (!apply) {
    console.log(`Dry run — would mint a new key labelled "${label}".`);
    console.log("Re-run with --apply to create it.");
    return;
  }

  const key = generateRandomKey();
  const [row] = await db
    .insert(slackBrokerInstances)
    .values({ keyHash: hashApiKey(key), label })
    .returning({ id: slackBrokerInstances.id });

  console.log(`\nMinted a broker key for "${label}" (instance ${row.id}).`);
  console.log("Give the customer this line for their values.yaml secrets.data:\n");
  console.log(`  LMNR_LICENSE_KEY: "${key}"\n`);
  console.log("Shown once. Only the hash is stored — if it is lost, delete the row and mint again.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Minting the Slack broker key failed:", error);
    process.exit(1);
  });
