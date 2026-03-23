import { eq } from "drizzle-orm";
import type { NextAuthOptions, User } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import OktaProvider from "next-auth/providers/okta";

import { createUser, getUserByEmail, updateUserAvatar } from "@/lib/db/auth";
import { db } from "@/lib/db/drizzle";
import { membersOfWorkspaces, workspaceInvitations } from "@/lib/db/migrations/schema";
import { getEmailsConfig } from "@/lib/server-utils";

import { sendWelcomeEmail } from "./emails/utils";
import { Feature, isFeatureEnabled } from "./features/features";

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

const getProviders = () => {
  const providerConfigs = [
    {
      feature: Feature.GITHUB_AUTH,
      provider: () =>
        GithubProvider({
          clientId: process.env.AUTH_GITHUB_ID!,
          clientSecret: process.env.AUTH_GITHUB_SECRET!,
        }),
    },
    {
      feature: Feature.GOOGLE_AUTH,
      provider: () =>
        GoogleProvider({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        }),
    },
    {
      feature: Feature.AZURE_AUTH,
      provider: () =>
        AzureADProvider({
          clientId: process.env.AUTH_AZURE_AD_CLIENT_ID!,
          clientSecret: process.env.AUTH_AZURE_AD_CLIENT_SECRET!,
          tenantId: process.env.AUTH_AZURE_AD_TENANT_ID!,
        }),
    },
    {
      feature: Feature.OKTA_AUTH,
      provider: () =>
        OktaProvider({
          clientId: process.env.AUTH_OKTA_CLIENT_ID!,
          clientSecret: process.env.AUTH_OKTA_CLIENT_SECRET!,
          issuer: process.env.AUTH_OKTA_ISSUER!,
        }),
    },
    {
      feature: Feature.EMAIL_AUTH,
      provider: () =>
        CredentialsProvider({
          id: "email",
          name: "Email",
          credentials: {
            email: {
              label: "Email",
              type: "email",
              placeholder: "username@example.com",
            },
            name: { label: "Name", type: "text", placeholder: "username" },
          },
          async authorize(credentials, req) {
            if (!credentials?.email) {
              return null;
            }
            return {
              id: credentials.email,
              name: credentials.name,
              email: credentials.email,
            } as User;
          },
        }),
    },
  ];

  return providerConfigs.filter(({ feature }) => isFeatureEnabled(feature)).map(({ provider }) => provider());
};

export const authOptions: NextAuthOptions = {
  providers: getProviders(),
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      const list = await getEmailsConfig();
      if (account?.provider === "github" && user?.email && !!list) {
        return list.includes(user.email);
      }
      return true;
    },
    async jwt({ token, profile, trigger }) {
      if (trigger === "signIn") {
        if (!token.name || !token.email) {
          throw new Error("Name and email are required");
        }

        try {
          const existingUser = await getUserByEmail(token.email);
          if (existingUser) {
            token.userId = existingUser.id;
            if (!existingUser?.avatarUrl && token?.picture) {
              await updateUserAvatar(existingUser.id, token.picture);
            }
          } else {
            const user = await createUser(token.name, token.email, token.picture);
            token.userId = user.id;

            if (isFeatureEnabled(Feature.SEND_EMAIL) && profile?.email) {
              await sendWelcomeEmail(profile?.email);
            }
          }

          // In self-hosted mode (no email sending), process any pending
          // workspace invitations for this user. When SEND_EMAIL is enabled
          // (cloud), invitations go through the explicit email accept/decline
          // flow instead, so we must not auto-accept them here.
          if (!isFeatureEnabled(Feature.SEND_EMAIL)) {
            await processPendingInvitations(token.userId as string, token.email);
          }
        } catch (e) {
          throw new Error("Failed to authenticate user.");
        }
      }

      return token;
    },
    session({ session, token }) {
      session.user.email = token.email;
      session.user.name = token.name;
      session.user.id = token.userId;

      return session;
    },
  },
  pages: {
    signIn: "/sign-in", // overrides the next-auth default signin page https://authjs.dev/guides/basics/pages
  },
};
