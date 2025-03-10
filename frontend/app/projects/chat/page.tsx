import { uniqueId } from "lodash";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import Chat from "@/components/chat";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Agent",
};

export default async function ChatPage() {
  const session = await getServerSession(authOptions);
  const id = uniqueId();

  if (!session) {
    redirect("/sign-in?callbackUrl=/onboarding");
  }

  const user = session.user;

  return <Chat id={id} initialMessages={[]} selectedChatModel={""} />;
}
