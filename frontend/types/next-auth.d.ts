import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    supabaseAccessToken: string;
    user: {
      id: string;
      apiKey: string;
      isNewUserCreated: boolean;
    } & DefaultSession["user"];
  }

  interface Profile {
    login: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    apiKey: string;
    isNewUserCreated: boolean;
  }
}
