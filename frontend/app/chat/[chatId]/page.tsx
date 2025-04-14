import { asc, eq } from "drizzle-orm";
import { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import NotFound from "@/app/not-found";
import Chat from "@/components/chat";
import { AgentSession, ChatMessage } from "@/components/chat/types";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { agentMessages, agentSessions, users } from "@/lib/db/migrations/schema";

export const metadata: Metadata = {
  title: "Index",
};

export default async function ChatPage(props: { params: Promise<{ chatId: string }> }) {
  const session = await getServerSession(authOptions);

  const params = await props.params;
  const { chatId } = params;

  if (!session) {
    redirect("/sign-in?callbackUrl=/chat/" + chatId);
  }

  const chat = (await db.query.agentSessions.findFirst({
    where: eq(agentSessions.sessionId, chatId),
    columns: {
      agentStatus: true,
    },
  })) as { agentStatus: AgentSession["agentStatus"] } | undefined;

  if (!chat) {
    return notFound();
  }

  const messages = (await db.query.agentMessages.findMany({
    where: eq(agentMessages.sessionId, chatId),
    orderBy: asc(agentMessages.createdAt),
  })) as ChatMessage[];

  const user = session.user;

  const result = await db.query.users.findFirst({
    where: eq(users.email, String(user.email)),
    columns: {
      id: true,
    },
  });

  if (!result) {
    return <NotFound />;
  }

  return (
    <Chat
      agentStatus={chat.agentStatus}
      sessionId={chatId}
      user={{ ...user, id: result.id }}
      initialMessages={messages}
    />
  );
}
