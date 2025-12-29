// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string | null;
    };
  }

  interface Profile {
    login: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    name: string;
    email: string;
  }
}
