"use client";

import { uniqueId } from "lodash";
import { User } from "next-auth";
import { useState } from "react";

import ChatHeader from "@/components/chat/header";
import Messages from "@/components/chat/messages";
import MultimodalInput from "@/components/chat/multimodal-input";
import { ChatMessage } from "@/components/chat/types";
import { useAgentStream } from "@/components/chat/use-agent-stream";

interface ChatProps {
  id: string;
  user: User;
  initialMessages: ChatMessage[];
}

const Chat = ({ id, user, initialMessages }: ChatProps) => {
  const { streamAgent } = useAgentStream();

  const [isLoading, setIsLoading] = useState(false);

  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uniqueId(),
      content: "some message",
      role: "user",
      isStateMessage: true,
    },
    {
      id: uniqueId(),
      content: "answer message",
      role: "assistant",
      isStateMessage: true,
    },
    {
      id: uniqueId(),
      content: "answer message",
      role: "assistant",
      isStateMessage: true,
    },
    {
      id: uniqueId(),
      content: "answer message",
      role: "assistant",
      isStateMessage: true,
    },
    {
      id: uniqueId(),
      content: "answer message ",
      role: "assistant",
      isStateMessage: true,
    },
    {
      id: uniqueId(),
      content: "answer message",
      role: "assistant",
      isStateMessage: true,
    },
  ]);

  const handleSubmit = async (prompt: string) => {
    try {
      await streamAgent(prompt, (chunk) => {
        setMessages((prev) => [...prev, chunk]);
      });
    } catch (error) {
      console.error("Error:", error);
    }
  };

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <ChatHeader chatId={id} />
      <div className="flex flex-1">
        <Messages messages={messages} />
      </div>
      <form
        onClick={() => handleSubmit("hello")}
        className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl"
      >
        <MultimodalInput stop={stop} isLoading={isLoading} value={value} onChange={setValue} />
      </form>
    </div>
  );
};

export default Chat;
