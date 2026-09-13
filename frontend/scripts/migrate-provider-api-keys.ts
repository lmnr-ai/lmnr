// One-off runner for deployments where startup migrations are disabled (ENVIRONMENT=PRODUCTION).
//
//   pnpm db:migrate-provider-api-keys                 dry run, prints the plan
//   pnpm db:migrate-provider-api-keys --apply         create profiles, delete the legacy rows
//   pnpm db:migrate-provider-api-keys --apply --keep  create profiles, keep legacy rows (a second
//                                                     --apply would then duplicate the profiles)
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const apply = process.argv.includes("--apply");
  const keep = process.argv.includes("--keep");
  const { migrateProviderApiKeys } = await import("@/lib/db/migrate-provider-api-keys.ts");
  const summary = await migrateProviderApiKeys({ dryRun: !apply, deleteLegacyRows: !keep });
  console.log(`${apply ? "Applied" : "Dry run"}:`, summary);
  if (!apply && summary.legacyRows > 0) console.log("Re-run with --apply to write these profiles.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("provider_api_keys migration failed:", error);
    process.exit(1);
  });
