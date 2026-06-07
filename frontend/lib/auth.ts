import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, keycloak, microsoftEntraId, okta } from "better-auth/plugins/generic-oauth";
import { jwt } from "better-auth/plugins/jwt";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

import { localEmail } from "@/lib/auth-local-email";
import { db } from "@/lib/db/drizzle";
import * as schema from "@/lib/db/migrations/schema";
import { apiKeys, membersOfWorkspaces, users, workspaceInvitations } from "@/lib/db/migrations/schema";
import PostHogClient from "@/lib/posthog/server";
import { getEmailsConfig } from "@/lib/server-utils";
import { generateRandomKey } from "@/lib/utils";

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

const trackUserCreated = (email: string, provider: string): void => {
  try {
    const client = PostHogClient();
    if (!client) return;

    const createdAt = new Date().toISOString();
    client.capture({
      distinctId: email,
      event: "auth:user_created",
      properties: {
        provider,
        $set_once: {
          created_at: createdAt,
          signup_provider: provider,
        },
      },
    });
  } catch {
    // Analytics failures must never break login.
  }
};

// Derive the provider id from the in-flight endpoint path (e.g.
// `/callback/github` or `/oauth2/callback/keycloak`). Used to scope the GitHub
// allow-list gate the way the legacy NextAuth `signIn` callback did.
const providerFromContext = (context: { path?: string; params?: Record<string, string> } | null): string => {
  if (!context) return "unknown";
  if (context.params?.id) return context.params.id;
  const match = context.path?.match(/\/(?:oauth2\/)?callback\/([^/?]+)/);
  return match?.[1] ?? "unknown";
};

const getSocialProviders = (): NonNullable<BetterAuthOptions["socialProviders"]> => {
  const providers: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (isFeatureEnabled(Feature.GITHUB_AUTH)) {
    providers.github = {
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    };
  }
  if (isFeatureEnabled(Feature.GOOGLE_AUTH)) {
    providers.google = {
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    };
  }
  return providers;
};

const getGenericOAuthConfig = () => {
  const config = [];
  if (isFeatureEnabled(Feature.AZURE_AUTH)) {
    config.push(
      microsoftEntraId({
        clientId: process.env.AUTH_AZURE_AD_CLIENT_ID!,
        clientSecret: process.env.AUTH_AZURE_AD_CLIENT_SECRET!,
        tenantId: process.env.AUTH_AZURE_AD_TENANT_ID!,
      })
    );
  }
  if (isFeatureEnabled(Feature.OKTA_AUTH)) {
    config.push(
      okta({
        clientId: process.env.AUTH_OKTA_CLIENT_ID!,
        clientSecret: process.env.AUTH_OKTA_CLIENT_SECRET!,
        issuer: process.env.AUTH_OKTA_ISSUER!,
      })
    );
  }
  if (isFeatureEnabled(Feature.KEYCLOAK_AUTH)) {
    config.push(
      keycloak({
        clientId: process.env.AUTH_KEYCLOAK_ID!,
        clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
        issuer: process.env.AUTH_KEYCLOAK_ISSUER!,
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
    // Passwordless local-email sign-in (self-hosted convenience); only mounted
    // when no real IdP is configured, matching the legacy Credentials provider.
    ...(isFeatureEnabled(Feature.EMAIL_AUTH) ? [localEmail()] : []),
    // Keep Set-Cookie working from Next.js server actions / route handlers.
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user, context) => {
          // GitHub allow-list gate (legacy NextAuth `signIn` callback parity):
          // block account creation for emails outside allowed-emails.json.
          const provider = providerFromContext(context);
          if (provider === "github" && user.email) {
            const list = await getEmailsConfig();
            if (list && !list.includes(user.email)) {
              return false;
            }
          }
          return;
        },
        after: async (user, context) => {
          // Every user needs a personal API key row (legacy createUser did this
          // in the same transaction as the user insert).
          await db
            .insert(apiKeys)
            .values({ userId: user.id, apiKey: generateRandomKey(64) })
            .onConflictDoNothing();

          trackUserCreated(user.email, providerFromContext(context));
        },
      },
    },
    session: {
      create: {
        before: async (session, context) => {
          // Re-gate returning GitHub users against the allow-list on every login.
          const provider = providerFromContext(context ?? null);
          if (provider === "github") {
            const list = await getEmailsConfig();
            if (list) {
              const [user] = await db
                .select({ email: users.email })
                .from(users)
                .where(eq(users.id, session.userId))
                .limit(1);
              if (user && !list.includes(user.email)) {
                return false;
              }
            }
          }
          return;
        },
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
