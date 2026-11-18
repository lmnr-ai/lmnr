import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";

import { auth, MCP_RESOURCE_URL } from "@/lib/auth";

type SearchParams = { [key: string]: string | string[] | undefined } | undefined;

/**
 * Returns the signed MCP authorization request carried by a login/consent page URL, or
 * null when there is none or its signature is invalid/expired. Server-only (uses the secret).
 */
export const getVerifiedOAuthQuery = async (searchParams: SearchParams): Promise<URLSearchParams | null> => {
  if (!MCP_RESOURCE_URL || !searchParams?.sig) return null;
  const all = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) all.append(key, v);
  }
  // Only the parameters the signature covers; the page may carry its own (e.g. callbackUrl).
  const signed = new Set(["sig", "ba_param", ...all.getAll("ba_param")]);
  const query = new URLSearchParams([...all].filter(([key]) => signed.has(key)));
  const { secret } = await auth.$context;
  return (await verifyOAuthQueryParams(query.toString(), secret)) ? query : null;
};
