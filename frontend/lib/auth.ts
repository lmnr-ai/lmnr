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

import { Feature, isFeatureEnabled } from "./features/features";

const AUTH_SECRET = process.env.BETTER_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const AUTH_URL = process.env.BETTER_AUTH_URL ?? process.env.NEXTAUTH_URL;

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
const legacyCallbackUri = (legacyProviderId: string) => `${AUTH_URL}/api/auth/callback/${legacyProviderId}`;

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
  baseURL: AUTH_URL,
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
  session: {
    // Serve session+user from a short-lived signed cookie instead of a Postgres
    // round-trip on every getSession. Each navigation triggers getSession ~4x
    // (middleware proxy.ts + the (auth), (app), and project layouts), and each
    // call was 2 sequential round-trips (session row, then user row — the
    // drizzle adapter doesn't join). cookieCache collapses all of that to an
    // HMAC verify. Membership/authz freshness is unaffected (governed by the
    // separate 30-day membership cache); the only staleness is name/email/avatar
    // edits and cross-device session revocation lagging up to maxAge.
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
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
      verificationUri: "/device",
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
