import { acquireActiveSCIMUserLink } from "@better-auth/scim";
import { sso, type SSOOptions } from "@better-auth/sso";

import { OKTA_NOT_PROVISIONED_ERROR, OKTA_PROVIDER_ID, OKTA_SCIM_CONNECTION_ID } from "./constants";

type ResolveUser = NonNullable<SSOOptions["resolveUser"]>;

// With SCIM, Okta assignment is the only way in: a sign-in must match an active SCIM user,
// so a deprovisioned user is rejected even if their Okta login still works.
const resolveProvisionedUser: ResolveUser = async ({ accountKey }, { database }) => {
  const link = await acquireActiveSCIMUserLink(
    { connectionId: OKTA_SCIM_CONNECTION_ID, externalId: accountKey.accountId },
    { database }
  );
  if (!link) return { action: "reject", code: OKTA_NOT_PROVISIONED_ERROR };
  return { action: "link", userId: link.userId, profile: "update" };
};

// Without SCIM, Okta stays a trusted provider: an existing user with the same email is linked,
// as `accountLinking.trustedProviders` does for the other IdPs.
const resolveUserByEmail: ResolveUser = async ({ accountKey, providerUser }, { database }) => {
  const account = await database.findOne({
    model: "account",
    where: [
      { field: "providerId", value: OKTA_PROVIDER_ID },
      { field: "accountId", value: accountKey.accountId },
    ],
  });
  if (account) return { action: "continue" };

  const user = await database.findOne<{ id: string }>({
    model: "user",
    where: [{ field: "email", value: providerUser.email.toLowerCase() }],
  });
  return user ? { action: "link", userId: user.id, profile: "update" } : { action: "continue" };
};

export const oktaIssuerOrigin = () => new URL(process.env.AUTH_OKTA_ISSUER!).origin;

export const oktaSSO = ({ redirectURI, scimEnabled }: { redirectURI: string; scimEnabled: boolean }) => {
  // Okta's `iss` claim has no trailing slash, and the ID token must match it exactly.
  const issuer = process.env.AUTH_OKTA_ISSUER!.replace(/\/+$/, "");
  return sso({
    defaultSSO: [
      {
        providerId: OKTA_PROVIDER_ID,
        domain: new URL(issuer).hostname,
        oidcConfig: {
          issuer,
          discoveryEndpoint: `${issuer}/.well-known/openid-configuration`,
          clientId: process.env.AUTH_OKTA_CLIENT_ID!,
          clientSecret: process.env.AUTH_OKTA_CLIENT_SECRET!,
          pkce: true,
          // The plugin's default adds offline_access, which needs the refresh-token grant
          // enabled on the Okta app.
          scopes: ["openid", "profile", "email"],
          overrideUserInfo: true,
        },
      },
    ],
    redirectURI,
    // Providers are code-defined; nobody may register one through the API.
    providersLimit: 0,
    resolveUser: scimEnabled ? resolveProvisionedUser : resolveUserByEmail,
  });
};
