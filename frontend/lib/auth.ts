import type { DefaultSession, NextAuthOptions, User } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { fetcher } from './utils'
import jwt from "jsonwebtoken"

declare module 'next-auth' {
  interface Session {
    supabaseAccessToken: string
    user: {
      id: string
      apiKey: string
    } & DefaultSession['user']
  }

  interface Profile {
    login: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    apiKey: string
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
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
        const user = { id: credentials.email, name: credentials.name, email: credentials.email } as User
        return user;
      }
    }),
  ],
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
        })

        if (!res.ok) {
          const err = new Error('HTTP status code: ' + res.status)

          throw err
        }

        token.apiKey = (await res.json()).apiKey
      }

      return token
    },
    session({ session, token }) {
      session.user.apiKey = token.apiKey
      session.user.email = token.email!
      // session.user.email = token.email

      return session
    },
  },
  pages: {
    signIn: '/sign-in' // overrides the next-auth default signin page https://authjs.dev/guides/basics/pages
  }
}
