import { headers } from "next/headers";
import { cache } from "react";

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
 *
 * Wrapped in React `cache()` so the multiple nested layouts that each call this
 * during one render pass — `(auth)/layout`, `(auth)/(app)/layout`, and the
 * project layout via `requireProjectAccess` — share a single getSession instead
 * of repeating it. Per-request scoped; never leaks across requests.
 */
export const getServerSession = cache(async (): Promise<ServerSession | null> => {
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
});
