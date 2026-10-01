// Manual eval of the onboarding company guess against the env-configured provider.
// Run from frontend/: npx tsx --env-file=.env scripts/eval-company-name.ts [small|medium|large]
import { guessCompanyName } from "../lib/actions/onboarding/company-name";
import { envLanguageModel, type ModelTier } from "../lib/ai/model";
import { orgDomainFromEmail, orgNameFromEmail } from "../lib/email-domain";

type Category = "obvious" | "domain ≠ brand" | "small / new" | "made up";

// expected: brand name we want, or null when the right answer is "unknown".
const CASES: Array<{ email: string; category: Category; expected: string | null }> = [
  { email: "ada@stripe.com", category: "obvious", expected: "Stripe" },
  { email: "ada@shopify.com", category: "obvious", expected: "Shopify" },
  { email: "ada@anthropic.com", category: "obvious", expected: "Anthropic" },
  { email: "ada@notion.so", category: "obvious", expected: "Notion" },
  { email: "ada@eng.vercel.com", category: "obvious", expected: "Vercel" },
  { email: "ada@bbc.co.uk", category: "obvious", expected: "BBC" },

  { email: "ada@fb.com", category: "domain ≠ brand", expected: "Meta" },
  { email: "ada@abc.xyz", category: "domain ≠ brand", expected: "Alphabet" },
  { email: "ada@anysphere.co", category: "domain ≠ brand", expected: "Anysphere" },
  { email: "ada@squareup.com", category: "domain ≠ brand", expected: "Square" },
  { email: "ada@getcruise.com", category: "domain ≠ brand", expected: "Cruise" },
  { email: "ada@joinhoney.com", category: "domain ≠ brand", expected: "Honey" },
  { email: "ada@hey.com", category: "domain ≠ brand", expected: null },
  { email: "ada@tryramp.com", category: "domain ≠ brand", expected: "Ramp" },

  { email: "ada@lmnr.ai", category: "small / new", expected: "Laminar" },
  { email: "ada@sierra.ai", category: "small / new", expected: "Sierra" },
  { email: "ada@decagon.ai", category: "small / new", expected: "Decagon" },
  { email: "ada@usebasis.co", category: "small / new", expected: null },

  { email: "ada@zyxtrabond.io", category: "made up", expected: null },
  { email: "ada@quantumpanda-labs.dev", category: "made up", expected: null },
  { email: "ada@acme-widgets-llc.com", category: "made up", expected: null },
  { email: "ada@northbeam-ops.ai", category: "made up", expected: null },
];

const verdict = (expected: string | null, got: string | null): string => {
  if (expected === null) return got ? "✗ guessed" : "✓ unknown";
  if (!got) return "~ unknown";
  return got.toLowerCase().includes(expected.toLowerCase()) ? "✓" : "✗";
};

async function main() {
  const tier = (process.argv[2] ?? "small") as ModelTier;
  const model = envLanguageModel(tier);
  console.log(`provider=${process.env.LLM_PROVIDER} tier=${tier}\n`);

  const rows = await Promise.all(
    CASES.map(async ({ email, category }) => {
      const domain = orgDomainFromEmail(email);
      const heuristic = orgNameFromEmail(email);
      // Personal domains never reach the LLM in production either.
      if (!domain) return { category, email, heuristic, name: null, ms: 0, error: null };
      const started = Date.now();
      try {
        const name = await guessCompanyName(domain, model);
        return { category, email, heuristic, name, ms: Date.now() - started, error: null };
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        return {
          category,
          email,
          heuristic,
          name: null,
          ms: Date.now() - started,
          error,
        };
      }
    })
  );

  for (const [i, row] of rows.entries()) {
    const expected = CASES[i].expected;
    const shown = row.error ? `ERROR ${row.error.slice(0, 60)}` : (row.name ?? "—");
    console.log(
      [
        row.category.padEnd(15),
        row.email.padEnd(28),
        `heuristic=${row.heuristic ?? "—"}`.padEnd(26),
        `llm=${shown}`.padEnd(24),
        verdict(expected, row.name).padEnd(10),
        `${row.ms}ms`,
      ].join(" ")
    );
  }

  const latencies = rows
    .filter((r) => r.ms > 0)
    .map((r) => r.ms)
    .sort((a, b) => a - b);
  const p = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
  console.log(`\nlatency p50=${p(0.5)}ms p90=${p(0.9)}ms max=${latencies.at(-1)}ms (all calls concurrent)`);
}

// Imported app modules (db/cache clients) keep handles open; exit once the report is printed.
void main().then(() => process.exit(0));
