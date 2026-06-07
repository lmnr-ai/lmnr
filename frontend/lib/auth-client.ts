import { genericOAuthClient, jwtClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [genericOAuthClient(), jwtClient()],
});

export const { signIn, signOut, useSession, getSession } = authClient;

// Legacy NextAuth provider ids used across the auth UI. Social providers go
// through `signIn.social`; the rest are genericOAuth (`signIn.oauth2`), whose
// provider ids differ from the NextAuth names ("azure-ad" → "microsoft-entra-id").
export type AuthProvider = "github" | "google" | "azure-ad" | "okta" | "keycloak";

const OAUTH2_PROVIDER_IDS: Record<Exclude<AuthProvider, "github" | "google">, string> = {
  "azure-ad": "microsoft-entra-id",
  okta: "okta",
  keycloak: "keycloak",
};

// Unified sign-in across social + genericOAuth providers. Better Auth's client
// auto-redirects when the response carries `{ url, redirect: true }`, matching
// the legacy NextAuth `signIn(provider, { callbackUrl })` behaviour.
//
// `errorCallbackURL` routes IdP / callback failures (e.g. account-linking gate,
// allow-list rejection) back to `/sign-in?error=<code>` instead of Better Auth's
// default `/api/auth/error` page, so the sign-in page's `error` UI runs. The
// original `callbackUrl` is preserved so a successful retry still deep-links.
export const signInWithProvider = (provider: AuthProvider, callbackURL: string) => {
  const errorCallbackURL = `/sign-in?callbackUrl=${encodeURIComponent(callbackURL)}`;
  if (provider === "github" || provider === "google") {
    return authClient.signIn.social({ provider, callbackURL, errorCallbackURL });
  }
  return authClient.signIn.oauth2({ providerId: OAUTH2_PROVIDER_IDS[provider], callbackURL, errorCallbackURL });
};

// Sign in with our passwordless local-email endpoint (self-hosted convenience).
export const signInLocalEmail = (body: { email: string; name?: string; callbackURL?: string }) =>
  authClient.$fetch("/sign-in/local-email", { method: "POST", body });
