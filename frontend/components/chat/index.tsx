"use client";

import { Message, useChat } from "@ai-sdk/react";
import { Attachment } from "ai";
import { uniqueId } from "lodash";
import { useState } from "react";
import { useSWRConfig } from "swr";

import ChatHeader from "@/components/chat/header";
import MultimodalInput from "@/components/chat/multimodal-input";
import { useToast } from "@/lib/hooks/use-toast";

interface ChatProps {
  id: string;
  initialMessages: Message[];
  selectedChatModel: string;
}

const Chat = ({ id, initialMessages, selectedChatModel }: ChatProps) => {
  const { mutate } = useSWRConfig();

  const { toast } = useToast();
  const { messages, setMessages, handleSubmit, input, setInput, append, isLoading, stop, reload } = useChat({
    id,
    body: { id, selectedChatModel: selectedChatModel },
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: uniqueId,
    onFinish: async () => {
      await mutate("/api/history");
    },
    onError: () => {
      toast({ variant: "destructive", title: "Error", description: "An error occurred, please try again!" });
    },
  });

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  return (
    <div className="flex flex-col min-w-0 h-dvh bg-background">
      <ChatHeader chatId={id} />
      <div className="flex flex-1">Messages</div>
      <form className="flex mx-auto px-4 bg-background pb-4 md:pb-6 gap-2 w-full md:max-w-3xl">
        <MultimodalInput
          stop={stop}
          attachments={attachments}
          setAttachments={setAttachments}
          isLoading={isLoading}
          value={input}
          onChange={setInput}
        />
      </form>
    </div>
  );
};

export default Chat;
