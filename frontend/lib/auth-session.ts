import { headers } from "next/headers";

import { auth } from "@/lib/auth";

export interface ServerSession {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
  };
}

/**
 * Server-side session lookup. Returns the same shape the codebase consumed from
 * NextAuth's `getServerSession`, so call sites need only swap the import.
 */
export const getServerSession = async (): Promise<ServerSession | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return null;
  }
  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    },
  };
};
