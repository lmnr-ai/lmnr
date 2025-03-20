"use client";

import { isEmpty } from "lodash";
import { User } from "next-auth";
import { FormEvent, useState } from "react";

import ChatHeader from "@/components/chat/header";
import Messages from "@/components/chat/messages";
import MultimodalInput from "@/components/chat/multimodal-input";
import Placeholder from "@/components/chat/placeholder";
import Suggestions from "@/components/chat/suggestions";
import { ChatMessage } from "@/components/chat/types";
import { useAgentChat } from "@/components/chat/useAgentChat";

interface ChatProps {
  chatId: string;
  user: User;
  initialMessages: ChatMessage[];
}

const Chat = ({ chatId, user, initialMessages }: ChatProps) => {
  const [modelState, setModelState] = useState<{ model: string; enableThinking: boolean }>({
    model: "claude-3-7-sonnet-20250219",
    enableThinking: false,
  });

  const { messages, handleSubmit, stop, isLoading, input, setInput } = useAgentChat({
    id: chatId,
    initialMessages,
    userId: user.id,
  });

  const onSubmit = (e?: FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
    }
    handleSubmit(e, modelState);
  };

  const handleSubmitSuggestion = (suggestion: string, e?: FormEvent<HTMLFormElement>) => {
    setInput(suggestion);
    handleSubmit(e, modelState);
  };

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <ChatHeader />
      {isEmpty(messages) ? <Placeholder user={user} /> : <Messages isLoading={isLoading} messages={messages} />}
      <form
        onSubmit={onSubmit}
        className="flex flex-col mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl"
      >
        {isEmpty(messages) && <Suggestions chatId={chatId} onSubmit={handleSubmitSuggestion} />}
        <MultimodalInput
          modelState={modelState}
          onModelStateChange={setModelState}
          onSubmit={() => onSubmit()}
          stop={stop}
          isLoading={isLoading}
          value={input}
          onChange={setInput}
        />
      </form>
    </div>
  );
};

export default Chat;
