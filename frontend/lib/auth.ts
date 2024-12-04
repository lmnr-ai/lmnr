import jwt from 'jsonwebtoken';
import type { DefaultSession, NextAuthOptions, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';

import { sendWelcomeEmail } from './emails/utils';
import { Feature, isFeatureEnabled } from './features/features';
import { fetcher } from './utils';

declare module 'next-auth' {
  interface Session {
    supabaseAccessToken: string;
    user: {
      id: string;
      apiKey: string;
      isNewUserCreated: boolean;
    } & DefaultSession['user'];
  }

  interface Profile {
    login: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    apiKey: string;
    isNewUserCreated: boolean;
  }
}

const getProviders = () => {
  let providers = [];

  if (isFeatureEnabled(Feature.GITHUB_AUTH)) {
    providers.push(
      GithubProvider({
        clientId: process.env.AUTH_GITHUB_ID!,
        clientSecret: process.env.AUTH_GITHUB_SECRET!
      })
    );
  }

  if (isFeatureEnabled(Feature.GOOGLE_AUTH)) {
    providers.push(
      GoogleProvider({
        clientId: process.env.AUTH_GOOGLE_ID!,
        clientSecret: process.env.AUTH_GOOGLE_SECRET!
      })
    );
  }

  // this is only for local deployments
  // that's why authorize is just an identity function
  if (isFeatureEnabled(Feature.EMAIL_AUTH)) {
    providers.push(
      CredentialsProvider({
        id: 'email',
        name: 'Email',
        credentials: {
          email: {
            label: 'Email',
            type: 'email',
            placeholder: 'username@example.com'
          },
          name: { label: 'Name', type: 'text', placeholder: 'username' }
        },
        async authorize(credentials, req) {
          if (!credentials?.email) {
            return null;
          }
          const user = {
            id: credentials.email,
            name: credentials.name,
            email: credentials.email
          } as User;
          return user;
        }
      })
    );
  }

  return providers;
};

export const authOptions: NextAuthOptions = {
  providers: getProviders(),
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, profile, trigger }) {
      if (trigger === 'signIn') {
        // token always contains name, email and picture keys
        // name and email should always be provided, picture is optional

        // TODO: throw error if name or email is not provided
        const name = token.name;
        const email = token.email;
        const picture = token.picture ?? null;

        const res = await fetcher('/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + process.env.SHARED_SECRET_TOKEN
          },
          body: JSON.stringify({
            name,
            email,
            picture
          })
        });

        if (!res.ok) {
          const err = new Error('HTTP status code: ' + res.status);
          console.error(err);
          throw err;
        }

        const resJson = await res.json();

        const isNewUserCreated = resJson.isNewUserCreated;
        if (isNewUserCreated && isFeatureEnabled(Feature.SEND_EMAIL)) {
          sendWelcomeEmail(profile?.email!);
        }

        token.apiKey = resJson.apiKey;
        token.isNewUserCreated = isNewUserCreated;
      }

      return token;
    },
    session({ session, token }) {
      session.user.apiKey = token.apiKey;
      session.user.email = token.email!;
      session.user.name = token.name!;
      session.user.isNewUserCreated = token.isNewUserCreated;

      // injecting user info into Supabase parsable JWT
      if (isFeatureEnabled(Feature.SUPABASE)) {
        const signingSecret = process.env.SUPABASE_JWT_SECRET;
        if (signingSecret) {
          const payload = {
            aud: 'authenticated',
            exp: Math.floor(new Date(session.expires).getTime() / 1000),
            sub: token.apiKey,
            email: session.user.email,
            role: 'authenticated'
          };
          session.supabaseAccessToken = jwt.sign(payload, signingSecret);
        }
      }

      return session;
    }
  },
  pages: {
    signIn: '/sign-in' // overrides the next-auth default signin page https://authjs.dev/guides/basics/pages
  }
};
