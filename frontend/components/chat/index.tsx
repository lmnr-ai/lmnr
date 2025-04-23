"use client";

import { motion } from "framer-motion";
import { isEmpty } from "lodash";
import { User } from "next-auth";
import { FormEvent, useState } from "react";

import BrowserWindow from "@/components/chat/browser-window";
import Messages from "@/components/chat/messages";
import MultimodalInput from "@/components/chat/multimodal-input";
import Placeholder from "@/components/chat/placeholder";
import Suggestions from "@/components/chat/suggestions";
import { AgentSession, ChatMessage } from "@/components/chat/types";
import { useAgentChat } from "@/components/chat/use-agent-chat";
import { cn } from "@/lib/utils";

interface ChatProps {
  sessionId: string;
  agentStatus?: AgentSession["agentStatus"];
  user: User;
  initialMessages: ChatMessage[];
}

export interface ModelState {
  model: string;
  enableThinking: boolean;
  modelProvider: string;
}

const defaultModelState: ModelState = {
  model: "gemini-2.5-pro-preview-03-25",
  enableThinking: true,
  modelProvider: "gemini",
};
const Chat = ({ sessionId, agentStatus, user, initialMessages }: ChatProps) => {
  const modelFromStorage = typeof window !== "undefined" ? localStorage.getItem("chat-model") : null;

  const [modelState, setModelState] = useState<ModelState>(
    modelFromStorage ? JSON.parse(modelFromStorage) : defaultModelState
  );

  const { messages, handleSubmit, stop, isLoading, input, setInput, isControlled, setIsControlled } = useAgentChat({
    id: sessionId,
    initialMessages,
    userId: user.id,
    agentStatus,
  });

  const handleControl = async (): Promise<void> => {
    if (isControlled) {
      setIsControlled(false);
      await handleSubmit(undefined, modelState, "Returning control back, continue your task");
    } else {
      setIsControlled(true);
    }
  };

  const onSubmit = (e?: FormEvent<HTMLFormElement>) => {
    if (e) {
      e.preventDefault();
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("chat-model", JSON.stringify(modelState));
    }
    handleSubmit(e, modelState);
  };

  const handleSubmitWithInput = (input: string) => {
    setInput(input);
  };

  return (
    <div className="flex max-h-dvh">
      <div className="flex flex-col flex-1 min-w-0 h-dvh bg-background">
        {isEmpty(messages) ? (
          <Placeholder user={user} />
        ) : (
          <Messages onControl={handleControl} isLoading={isLoading} messages={messages} />
        )}
        <div className={cn("w-full", isEmpty(messages) ? "flex-1 flex flex-col" : "mt-auto")}>
          <motion.form
            layout
            onSubmit={onSubmit}
            transition={{ duration: 0.2 }}
            className="mx-auto w-full md:max-w-3xl px-4 bg-background pb-4 md:pb-6 gap-2 [&_textarea]:transition-none [&_textarea]:duration-0"
          >
            <MultimodalInput
              modelState={modelState}
              onModelStateChange={setModelState}
              onSubmit={() => onSubmit()}
              stop={stop}
              isLoading={isLoading}
              value={input}
              onChange={setInput}
            />
          </motion.form>
          {isEmpty(messages) && <Suggestions sessionId={sessionId} onSubmit={handleSubmitWithInput} />}
        </div>
      </div>
      <BrowserWindow isControlled={isControlled} onControl={handleControl} />
    </div>
  );
};

export default Chat;
