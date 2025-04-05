import { sql, asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { ChatMessage } from "@/components/chat/types";
import { db } from "@/lib/db/drizzle";
import { agentMessages, apiKeys, users, userUsage } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { authOptions } from "@/lib/auth";
import { getServerSession } from "next-auth";

export async function POST(req: NextRequest): Promise<Response> {
  const body = (await req.json()) as ChatMessage;
  const session = await getServerSession(authOptions);
  const user = session!.user;

  // Quick fix to get the user id from the api key
  const dbUser = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.apiKey, user.apiKey),
    with: {
      user: {
        columns: {
          id: true,
        }
      },
    },
  });
  if (!dbUser) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (isFeatureEnabled(Feature.SUBSCRIPTION)) {
    if (body.messageType === "user") {
      const usageAndLimits = await db.query.users.findFirst({
        where: eq(users.id, dbUser.userId),
        with: {
          userUsages: true,
          userSubscriptionTier: true,
        },
      });
      const usage = usageAndLimits?.userUsages?.[0]?.indexChatMessageCountSinceReset ?? 0;
      const limit = usageAndLimits?.userSubscriptionTier?.indexChatMessages ?? 1;
      if (usage >= limit && usageAndLimits?.userSubscriptionTier?.name?.trim().toLowerCase() === "free") {
        return new NextResponse("You have reached your limit of index chat messages. Upgrade to a paid plan to continue.", { status: 402 });
      }
    }
    await db.update(userUsage).set({
      indexChatMessageCountSinceReset: sql`${userUsage.indexChatMessageCountSinceReset} + 1`,
    }).where(eq(userUsage.userId, dbUser.userId));
  }

  await db.insert(agentMessages).values(body);

  return new Response(JSON.stringify({ ok: true }));
}

export async function GET(req: NextRequest): Promise<Response> {
  const { sessionId } = (await req.json()) as { sessionId: string };

  const messages = await db.query.agentMessages.findMany({
    where: eq(agentMessages.sessionId, sessionId),
    orderBy: asc(agentMessages.createdAt),
  });

  return new Response(JSON.stringify(messages));
}
