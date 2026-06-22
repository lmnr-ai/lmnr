import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins/bearer";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { genericOAuth, keycloak, microsoftEntraId, okta } from "better-auth/plugins/generic-oauth";
import { jwt } from "better-auth/plugins/jwt";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { localEmail } from "@/lib/auth-local-email";
import { db } from "@/lib/db/drizzle";
import * as schema from "@/lib/db/migrations/schema";
import { membersOfWorkspaces, users, workspaceInvitations } from "@/lib/db/migrations/schema";
import PostHogClient from "@/lib/posthog/server";
import { BASE_PATH } from "@/lib/utils";

import { Feature, isFeatureEnabled } from "./features/features";

const AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const AUTH_URL = process.env.BETTER_AUTH_URL ?? process.env.NEXTAUTH_URL;

// Better Auth's router derives its mount/strip path from `new URL(baseURL).pathname`
// (better-auth/dist/api/index.mjs), and Next.js already strips NEXT_PUBLIC_BASE_PATH
// before the route handler runs. So if a self-hoster sets BETTER_AUTH_URL to their
// full external URL including the sub-path (e.g. https://host/lmnr) — the natural
// thing to do — the router would try to strip `/lmnr` off an already-stripped
// `/api/auth/...` request and 404 EVERY auth route. Pin the server baseURL to the
// ORIGIN so the router always mounts at the default `/api/auth`. The sub-path is
// reintroduced where it's genuinely needed: in-browser client requests (see
// auth-client.ts `baseURL`) and OAuth callback URIs (legacyCallbackUri below, which
// rebuilds the prefixed `/api/auth/callback/<id>` from AUTH_ORIGIN + BASE_PATH).
const AUTH_ORIGIN = AUTH_URL ? new URL(AUTH_URL).origin : undefined;

/**
 * Process any pending workspace invitations for the given user.
 * Adds the user to all workspaces they've been invited to, then deletes the invitations.
 */
const processPendingInvitations = async (userId: string, email: string): Promise<void> => {
  const pendingInvitations = await db
    .select({
      id: workspaceInvitations.id,
      workspaceId: workspaceInvitations.workspaceId,
    })
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.email, email));

  if (pendingInvitations.length === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    for (const invitation of pendingInvitations) {
      await tx
        .insert(membersOfWorkspaces)
        .values({
          userId,
          workspaceId: invitation.workspaceId,
          memberRole: "member",
        })
        .onConflictDoNothing();

      await tx.delete(workspaceInvitations).where(eq(workspaceInvitations.id, invitation.id));
    }
  });
};

const trackUserCreated = (email: string): void => {
  try {
    const client = PostHogClient();
    if (!client) return;

    const createdAt = new Date().toISOString();
    client.capture({
      distinctId: email,
      event: "auth:user_created",
      properties: {
        $set_once: {
          created_at: createdAt,
        },
      },
    });
  } catch {
    // Analytics failures must never break login.
  }
};

const getSocialProviders = (): NonNullable<BetterAuthOptions["socialProviders"]> => {
  const providers: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (isFeatureEnabled(Feature.GITHUB_AUTH)) {
    providers.github = {
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
      // Social providers derive redirect_uri from `${context.baseURL}/callback/<id>`,
      // and baseURL is pinned to the origin (AUTH_ORIGIN), so under a sub-path deploy
      // the callback would drop the prefix and the IdP redirect_uri match fails. Pin
      // it explicitly to the prefixed legacy path, same as the generic-OAuth providers.
      redirectURI: legacyCallbackUri("github"),
      // Re-sync name/avatar from the IdP on every sign-in. The IdP is the sole
      // source of truth (no in-app profile editing), so this is safe and also
      // backfills avatars for users created before they had a picture (parity
      // with the legacy NextAuth `updateUserAvatar` backfill). Fields the IdP
      // omits are left untouched by the drizzle adapter, so an absent picture
      // won't clear an existing avatar.
      overrideUserInfoOnSignIn: true,
    };
  }
  if (isFeatureEnabled(Feature.GOOGLE_AUTH)) {
    providers.google = {
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      redirectURI: legacyCallbackUri("google"),
      overrideUserInfoOnSignIn: true,
    };
  }
  return providers;
};

// Pin redirect_uri to the LEGACY NextAuth path (`/api/auth/callback/<id>`), not
// Better Auth's default (`/oauth2/callback/<id>`): self-hosters already registered
// the legacy path with their IdP, and sending the new one fails the IdP's
// redirect_uri match. The next.config.ts rewrite forwards the inbound hit to
// Better Auth's handler. Azure's legacy id was `azure-ad`.
//
// Build from ORIGIN + the build-time-baked BASE_PATH, NOT from the raw AUTH_URL:
// the sub-path prefix is the source of truth baked into the image via
// NEXT_PUBLIC_BASE_PATH, and an operator naturally sets BETTER_AUTH_URL to their
// bare origin (`https://app.company.com`) without the `/lmnr` suffix. Deriving the
// callback from AUTH_URL would then drop the prefix → the IdP redirects to the
// unprefixed `/api/auth/callback/<id>`, which the reverse proxy doesn't forward → 404.
const legacyCallbackUri = (legacyProviderId: string) =>
  `${AUTH_ORIGIN}${BASE_PATH}/api/auth/callback/${legacyProviderId}`;

const getGenericOAuthConfig = () => {
  const config = [];
  if (isFeatureEnabled(Feature.AZURE_AUTH)) {
    config.push(
      microsoftEntraId({
        clientId: process.env.AUTH_AZURE_AD_CLIENT_ID!,
        clientSecret: process.env.AUTH_AZURE_AD_CLIENT_SECRET!,
        tenantId: process.env.AUTH_AZURE_AD_TENANT_ID!,
        redirectURI: legacyCallbackUri("azure-ad"),
        // PKCE on (NextAuth parity + OAuth 2.1): genericOAuth always sends a
        // code_verifier at token exchange, so without a code_challenge at
        // authorize the IdP rejects with invalid_grant. Required for OIDC here.
        pkce: true,
        // Re-sync name/avatar from the IdP on every sign-in (parity with the
        // legacy `updateUserAvatar` backfill). See getSocialProviders above.
        overrideUserInfo: true,
      })
    );
  }
  if (isFeatureEnabled(Feature.OKTA_AUTH)) {
    config.push(
      okta({
        clientId: process.env.AUTH_OKTA_CLIENT_ID!,
        clientSecret: process.env.AUTH_OKTA_CLIENT_SECRET!,
        issuer: process.env.AUTH_OKTA_ISSUER!,
        redirectURI: legacyCallbackUri("okta"),
        pkce: true,
        overrideUserInfo: true,
      })
    );
  }
  if (isFeatureEnabled(Feature.KEYCLOAK_AUTH)) {
    config.push(
      keycloak({
        clientId: process.env.AUTH_KEYCLOAK_ID!,
        clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
        issuer: process.env.AUTH_KEYCLOAK_ISSUER!,
        redirectURI: legacyCallbackUri("keycloak"),
        pkce: true,
        overrideUserInfo: true,
      })
    );
  }
  return config;
};

export const auth = betterAuth({
  secret: AUTH_SECRET,
  baseURL: AUTH_ORIGIN,
  session: {
    // Verify session from a signed cookie instead of the DB; revocation lags up to maxAge.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  // Reuse the existing `users` row id (uuid, DB default). Generating a uuid here
  // keeps every Better-Auth-managed id (session/account/verification/jwks, all
  // `text`) valid for the `uuid` users.id column and its FKs across the schema.
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  user: {
    // Our column is `avatar_url`; Better Auth's user model field is `image`.
    fields: {
      image: "avatarUrl",
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "google", "microsoft-entra-id", "okta", "keycloak"],
    },
  },
  socialProviders: getSocialProviders(),
  plugins: [
    genericOAuth({ config: getGenericOAuthConfig() }),
    // Preserve a verifiable JWT for any consumer that expects one (parity with
    // the legacy NextAuth JWT session). Exposes /api/auth/token + /api/auth/jwks.
    jwt({
      // `usePlural: true` on the drizzle adapter appends "s" to each model name.
      // The jwt plugin's model is already plural (`jwks`), so it becomes `jwkss`
      // (no such table). Set the singular base so pluralization yields `jwks`.
      schema: {
        jwks: {
          modelName: "jwk",
        },
      },
      jwt: {
        definePayload: ({ user }) => ({
          userId: user.id,
          name: user.name,
          email: user.email,
        }),
      },
    }),
    // Accept Authorization: Bearer <session-token> so the device-flow access
    // token (which IS a session token) round-trips through getSession().
    bearer(),
    // RFC 8628 device authorization for the CLI. /api/auth/device/{code,token}
    // run the protocol; /api/auth/device + /api/auth/device/{approve,deny} drive
    // the browser approval page at /device.
    deviceAuthorization({
      // Better Auth resolves this via `new URL(verificationUri, baseURL)`, and
      // baseURL is origin-only (AUTH_ORIGIN) — a bare `/device` would replace the
      // whole path and drop the baked sub-path, pointing the CLI at the unprefixed
      // (404ing) `/device`. Prefix with BASE_PATH so the RFC 8628 verification_uri
      // is `<origin><base>/device`; no-op (`/device`) when root-served.
      verificationUri: `${BASE_PATH}/device`,
      expiresIn: "15m",
      interval: "5s",
      userCodeLength: 8,
      deviceCodeLength: 40,
      validateClient: async (clientId: string) => clientId === "lmnr-cli",
      schema: {
        deviceCode: { modelName: "deviceCode" },
      },
    }),
    // Passwordless local-email sign-in (self-hosted convenience); only mounted
    // when no real IdP is configured, matching the legacy Credentials provider.
    ...(isFeatureEnabled(Feature.EMAIL_AUTH) ? [localEmail()] : []),
    // Keep Set-Cookie working from Next.js server actions / route handlers.
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          trackUserCreated(user.email);
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          // In self-hosted mode (no email sending) auto-accept pending workspace
          // invitations on every sign-in. With SEND_EMAIL (cloud), invitations
          // go through the explicit email accept/decline flow instead.
          if (!isFeatureEnabled(Feature.SEND_EMAIL)) {
            const [user] = await db
              .select({ email: users.email })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);
            if (user) {
              await processPendingInvitations(session.userId, user.email);
            }
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
