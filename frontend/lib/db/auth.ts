import { eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { apiKeys, users } from "@/lib/db/migrations/schema";
import { type UserSession } from "@/lib/types";
import { generateRandomKey } from "@/lib/utils";

export async function getUserByEmail(email: string): Promise<UserSession | undefined> {
  const user = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (!user) {
    return undefined;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user?.avatarUrl ?? undefined,
  };
}

export async function createUser(name: string, email: string, avatarUrl?: string | null): Promise<UserSession> {
  const apiKey = generateRandomKey(64);

  return await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        name,
        email,
        avatarUrl,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
      });

    await tx.insert(apiKeys).values({ userId: user.id, apiKey });

    return { ...user, apiKey };
  });
}

export async function updateUserAvatar(id: string, avatarUrl: string): Promise<void> {
  await db
    .update(users)
    .set({
      avatarUrl,
    })
    .where(eq(users.id, id));
}
