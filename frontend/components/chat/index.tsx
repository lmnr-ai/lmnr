"use client";

import { User } from "next-auth";

import ChatHeader from "@/components/chat/header";
import Messages from "@/components/chat/messages";
import MultimodalInput from "@/components/chat/multimodal-input";
import { ChatMessage } from "@/components/chat/types";
import { useAgentChat } from "@/components/chat/useAgentChat";

interface ChatProps {
  id: string;
  user: User;
  initialMessages: ChatMessage[];
}

const Chat = ({ id, user, initialMessages }: ChatProps) => {
  const { messages, handleSubmit, isLoading, input, setInput } = useAgentChat();

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <ChatHeader chatId={id} />
      {/*<div className="flex flex-1">*/}
      {/*  {messages.map((message) => (*/}
      {/*    <MessageReasoning key={message.messageId} content={message} />*/}
      {/*  ))}*/}
      <Messages isLoading={isLoading} messages={messages} />
      {/*</div>*/}
      <form onSubmit={handleSubmit} className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <MultimodalInput stop={stop} isLoading={isLoading} value={input} onChange={setInput} />
      </form>
    </div>
  );
};

export default Chat;
