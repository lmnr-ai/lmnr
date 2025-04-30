import jwt from "jsonwebtoken";
import type { NextAuthOptions, User } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";

import { createUser, getUserByEmail, updateUserAvatar } from "@/lib/db/auth";
import { getEmailsConfig } from "@/lib/server-utils";

import { sendWelcomeEmail } from "./emails/utils";
import { Feature, isFeatureEnabled } from "./features/features";

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
            token.apiKey = existingUser.apiKey;
            if (!existingUser?.avatarUrl && token?.picture) {
              console.log("setting avatar");
              await updateUserAvatar(existingUser.id, token.picture);
            }
          } else {
            const user = await createUser(token.name, token.email, token.picture);
            token.userId = user.id;
            token.apiKey = user.apiKey;

            if (isFeatureEnabled(Feature.SEND_EMAIL) && profile?.email) {
              await sendWelcomeEmail(profile?.email);
            }
          }
        } catch (e) {
          throw new Error("Failed to authenticate user.");
        }
      }

      return token;
    },
    session({ session, token }) {
      session.user.apiKey = token.apiKey;
      session.user.email = token.email;
      session.user.name = token.name;
      session.user.id = token.userId;

      // injecting user info into Supabase parsable JWT
      if (isFeatureEnabled(Feature.SUPABASE)) {
        const signingSecret = process.env.SUPABASE_JWT_SECRET;
        if (signingSecret) {
          const payload = {
            aud: "authenticated",
            exp: Math.floor(new Date(session.expires).getTime() / 1000),
            sub: token.apiKey,
            email: session.user.email,
            role: "authenticated",
          };
          session.supabaseAccessToken = jwt.sign(payload, signingSecret);
        }
      }

      return session;
    },
  },
  pages: {
    signIn: "/sign-in", // overrides the next-auth default signin page https://authjs.dev/guides/basics/pages
  },
};
