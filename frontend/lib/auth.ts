import type { DefaultSession, NextAuthOptions } from 'next-auth'
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
  ],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, profile, trigger }) {
      if (profile) {
        token.id = profile.sub
        token.image = profile.image
        token.email = profile.email!
      }

      if (trigger === 'signIn') {
        const name = profile?.name ? profile?.name : profile?.login

        const res = await fetcher('/auth/signin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + process.env.BACKEND_SHARED_SECRET
          },
          body: JSON.stringify({
            name,
            email: profile?.email
          })
        })

        if (!res.ok) {
          const err = new Error('HTTP status code: ' + res.status)

          throw err
        }

        token.apiKey = await res.json()
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
