import { asc, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { ChatMessage } from "@/components/chat/types";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { agentMessages, users, userUsage } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as ChatMessage;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  // Quick fix to get the user id from the api key
  const dbUser = await db.query.users.findFirst({
    where: eq(users.email, user.email!),
  });
  if (!dbUser) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (isFeatureEnabled(Feature.SUBSCRIPTION)) {
    if (body.messageType === "user") {
      const usageAndLimits = await db.query.users.findFirst({
        where: eq(users.id, dbUser.id),
        with: {
          userUsages: true,
          userSubscriptionTier: true,
        },
      });
      const usage = usageAndLimits?.userUsages?.[0]?.indexChatMessageCountSinceReset ?? 0;
      const limit = usageAndLimits?.userSubscriptionTier?.indexChatMessages ?? 1;
      if (usage >= limit && usageAndLimits?.userSubscriptionTier?.name?.trim().toLowerCase() === "free") {
        return new NextResponse(
          "You have reached your limit of index chat messages. Upgrade to a paid plan to continue.",
          { status: 402 }
        );
      }
    }
    await db
      .insert(userUsage)
      .values({
        indexChatMessageCountSinceReset: 1,
        indexChatMessageCount: 1,
        userId: dbUser.id,
      })
      .onConflictDoUpdate({
        target: [userUsage.userId],
        set: {
          indexChatMessageCountSinceReset: sql`${userUsage.indexChatMessageCountSinceReset} + 1`,
          indexChatMessageCount: sql`${userUsage.indexChatMessageCount} + 1`,
        },
      });
  }

  await db.insert(agentMessages).values(body);

  return new Response(JSON.stringify({ ok: true }));
}

export async function GET(req: NextRequest): Promise<Response> {
  const sessionId = req.nextUrl.searchParams.get('sessionId')!;

  const messages = await db.query.agentMessages.findMany({
    where: eq(agentMessages.sessionId, sessionId),
    orderBy: asc(agentMessages.createdAt),
  });

  return new Response(JSON.stringify(messages));
}
