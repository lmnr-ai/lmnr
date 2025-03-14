import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import NotFound from "@/app/not-found";
import Chat from "@/components/chat";
import { ChatMessage } from "@/components/chat/types";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db/drizzle";
import { agentMessages, users } from "@/lib/db/migrations/schema";

export default async function ChatPage(props: { params: Promise<{ chatId: string }> }) {
  const session = await getServerSession(authOptions);

  const params = await props.params;
  const { chatId } = params;

  if (!session) {
    redirect("/sign-in?callbackUrl=/onboarding");
  }

  const messages = (await db.query.agentMessages.findMany({
    where: eq(agentMessages.chatId, chatId),
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

  return <Chat chatId={chatId} userId={result.id} initialMessages={messages} />;
}
