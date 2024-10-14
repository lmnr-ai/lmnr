import type { DefaultSession, NextAuthOptions, User } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GithubProvider from 'next-auth/providers/github';
import GoogleProvider from 'next-auth/providers/google';
import { fetcher } from './utils';
import jwt from 'jsonwebtoken';

declare module 'next-auth' {
  interface Session {
    supabaseAccessToken: string
    user: {
      id: string
      apiKey: string
      isNewUserCreated: boolean
    } & DefaultSession['user']
  }

  interface Profile {
    login: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    apiKey: string
    isNewUserCreated: boolean
  }
}

let providers = [];

if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(GithubProvider({
    clientId: process.env.AUTH_GITHUB_ID!,
    clientSecret: process.env.AUTH_GITHUB_SECRET!
  }));
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(GoogleProvider({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET
  }));
}

// this is pushed always, but TypeScript complains if it is added to array at initialization
providers.push(
  CredentialsProvider({
    id: 'email',
    name: 'Email',
    credentials: {
      email: { label: 'Email', type: 'email', placeholder: 'username@example.com' },
      name: { label: 'Name', type: 'text', placeholder: 'username' }
    },
    async authorize(credentials, req) {
      if (!credentials?.email) {
        return null;
      }
      const user = { id: credentials.email, name: credentials.name, email: credentials.email } as User;
      return user;
    }
  }),
);

export const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, trigger }) {
      if (trigger === 'signIn') {
        const name = token.name;

        const res = await fetcher('/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + process.env.BACKEND_SHARED_SECRET
          },
          body: JSON.stringify({
            name,
            email: token?.email
          })
        });

        if (!res.ok) {
          const err = new Error('HTTP status code: ' + res.status);

          throw err;
        }

        const resJson = await res.json();
        token.apiKey = resJson.apiKey;
        token.isNewUserCreated = resJson.isNewUserCreated;
      }

      return token;
    },
    session({ session, token }) {
      session.user.apiKey = token.apiKey;
      session.user.email = token.email!;
      session.user.isNewUserCreated = token.isNewUserCreated;

      return session;
    },
  },
  pages: {
    signIn: '/sign-in' // overrides the next-auth default signin page https://authjs.dev/guides/basics/pages
  }
};
