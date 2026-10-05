import { generateText, Output } from "ai";
import { z } from "zod";

import { getLanguageModel } from "@/lib/ai/feature-model";
import { LlmFeature } from "@/lib/ai/features";
import { cache, ONBOARDING_COMPANY_NAME_CACHE_KEY } from "@/lib/cache";

// Onboarding blocks on this lookup, so it gets one short attempt and then gives up.
const LLM_TIMEOUT_MS = 2000;
// Brand names rarely change; a week lets teammates signing up later skip the call.
const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

// `name: null` caches "unknown company" too, so it isn't re-asked on every visit.
interface CachedCompanyName {
  name: string | null;
}

const cacheKey = (domain: string) => `${ONBOARDING_COMPANY_NAME_CACHE_KEY}:${domain}`;

const SYSTEM_PROMPT = `You identify a company from its email domain so an AI-agent observability product can personalize onboarding.

Answer only from what you actually know about the company behind this exact domain. Many sign-ups are small or new startups you won't recognize: then set known to false and leave name empty. A wrong guess is worse than no answer, so never infer a business from the domain's wording alone.

When known is true, name is the company's short brand name as people write it ("Acme", not "Acme Inc.").`;

const OutputSchema = z.object({
  known: z.boolean(),
  name: z.string(),
});

export async function guessCompanyName(domain: string): Promise<string | null> {
  const { output } = await generateText({
    model: await getLanguageModel(LlmFeature.ONBOARDING_COMPANY_NAME),
    system: SYSTEM_PROMPT,
    prompt: `Domain: ${domain}`,
    output: Output.object({ schema: OutputSchema }),
    maxRetries: 0,
    temperature: 0,
    timeout: LLM_TIMEOUT_MS,
  });
  return output.known ? output.name.trim().slice(0, 60) || null : null;
}

/** Cache hit, or undefined on a miss (or an unreachable cache). */
export async function getCachedCompanyName(domain: string): Promise<CachedCompanyName | undefined> {
  try {
    return (await cache.get<CachedCompanyName>(cacheKey(domain))) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Brand name for a work-email domain (from `orgDomainFromEmail`), or null when
 * the model doesn't recognize the company or the call fails. Failures are not
 * cached, so the next visit retries. Never throws.
 */
export async function resolveCompanyName(domain: string): Promise<string | null> {
  const cached = await getCachedCompanyName(domain);
  if (cached) return cached.name;
  try {
    const name = await guessCompanyName(domain);
    await cache
      .set<CachedCompanyName>(cacheKey(domain), { name }, { expireAfterSeconds: CACHE_TTL_SECONDS })
      .catch(() => undefined);
    return name;
  } catch {
    return null;
  }
}
