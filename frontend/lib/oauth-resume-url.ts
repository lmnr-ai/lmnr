// Dependency-free so tests can import it (lib/auth-oauth-query.ts pulls in lib/auth).

// Parameters the OAuth provider adds when it signs an authorization request for the
// login/consent pages. They are not part of the client's original /oauth2/authorize call.
const SIGNING_PARAMS = new Set(["sig", "exp", "ba_iat", "ba_param", "ba_pl"]);

/**
 * Prefix-free `/api/auth/oauth2/authorize?...` URL that re-runs the client's authorization
 * request once the user has a session. Used as the sign-in callbackUrl so every sign-in
 * method resumes the flow, including redirect-based ones (Okta SSO) that the provider's
 * own sign-in hook does not carry through the IdP round trip.
 */
export const oauthResumeUrl = (signedQuery: URLSearchParams): string => {
  const params = new URLSearchParams([...signedQuery].filter(([key]) => !SIGNING_PARAMS.has(key)));
  // The user has just authenticated, so a login prompt / max_age is satisfied; keeping
  // them would bounce straight back to the sign-in page.
  const prompt = params
    .get("prompt")
    ?.split(" ")
    .filter((p) => p && p !== "login")
    .join(" ");
  if (prompt) params.set("prompt", prompt);
  else params.delete("prompt");
  params.delete("max_age");
  return `/api/auth/oauth2/authorize?${params.toString()}`;
};
