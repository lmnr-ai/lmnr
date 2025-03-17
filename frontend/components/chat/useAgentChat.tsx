import { createParser } from "eventsource-parser";
import { uniqueId } from "lodash";
import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { v4 } from "uuid";

import { AgentSession, ChatMessage, RunAgentResponseStreamChunk } from "@/components/chat/types";

interface UseAgentChatOptions {
  api?: string;
  id: string;
  userId: string;
  initialMessages?: ChatMessage[];
  onFinish?: (message: ChatMessage) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}

interface UseAgentChatHelpers {
  messages: ChatMessage[];
  isLoading: boolean;
  handleSubmit: (e?: FormEvent<HTMLFormElement>, options?: { model: string; enableThinking: boolean }) => Promise<void>;
  handleInputChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  stop: () => void;
}

const defaultOptions = { model: "claude-3-7-sonnet-latest", enableThinking: true };

const parseStream = (onChunk: (chunk: RunAgentResponseStreamChunk) => void) => {
  const parser = createParser((event) => {
    if (event.type === "event" && event.data) {
      try {
        const chunk = JSON.parse(event.data) as RunAgentResponseStreamChunk;
        onChunk(chunk);
      } catch (e) {
        console.error("Failed to parse streaming message", e);
      }
    }
  });

  return (chunk: Uint8Array) => {
    const str = new TextDecoder().decode(chunk);
    parser.feed(str);
  };
};

const connectToStream = async (
  api: string,
  chatId: string,
  isNewUserMessage: boolean,
  modelOptions: { model: string; enableThinking: boolean },
  onChunk: (chunk: RunAgentResponseStreamChunk) => void,
  onError: (error: Error) => void,
  signal?: AbortSignal,
  prompt?: string
) => {
  const response = await fetch(api, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chatId,
      isNewUserMessage,
      prompt: prompt,
      ...modelOptions,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No reader available");
  }

  try {
    const processStream = parseStream(onChunk);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      processStream(value);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return;
    }
    if (error instanceof Error) {
      onError(error);
    }
  } finally {
    reader.releaseLock();
  }
};

const postUserMessage = async (message: ChatMessage) => {
  try {
    await fetch("/api/agent-messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
  } catch (e) {
    console.error(e);
  }
};

export function useAgentChat({
  api = "/api/agent",
  id,
  initialMessages = [],
  onFinish,
  onError,
  userId,
}: UseAgentChatOptions): UseAgentChatHelpers {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { mutate } = useSWRConfig();

  const handleAppendChat = async (chat: AgentSession) => {
    await mutate(
      "/api/agent-sessions",
      (sessions: AgentSession[] | undefined) => (sessions ? [chat, ...sessions] : [chat]),
      { revalidate: false, populateCache: true, rollbackOnError: true }
    );
  };

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort("Chat stopped");
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    async (e?: FormEvent<HTMLFormElement>, options?: { model: string; enableThinking: boolean }) => {
      if (e) {
        e.preventDefault();
      }

      if (!input.trim() || isLoading) {
        return;
      }

      const modelOptions = options ?? defaultOptions;

      setIsLoading(true);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      window.history.replaceState({}, "", `/chat/${id}`);

      const userMessage: ChatMessage = {
        id: v4(),
        messageType: "user",
        content: {
          text: input,
        },
        chatId: id,
        userId,
        createdAt: new Date().toISOString(),
      };

      setMessages((messages) => [...messages, userMessage]);
      setInput("");

      if (messages.length <= 1) {
        const optimisticChat: AgentSession = {
          chatId: id,
          chatName: input.substring(0, 30),
          status: "running",
          machineId: "",
          userId,
          updatedAt: new Date().toISOString(),
        };

        await handleAppendChat(optimisticChat);
      }

      try {
        await connectToStream(
          api,
          id,
          true,
          modelOptions,
          (chunk) => {
            if (chunk.chunk_type === "step") {
              const stepMessage: ChatMessage = {
                id: chunk.messageId,
                messageType: chunk.chunk_type,
                content: {
                  summary: chunk.summary,
                  actionResult: chunk.actionResult,
                },
                userId,
                chatId: id,
              };
              setMessages((messages) => [...messages, stepMessage]);
            } else if (chunk.chunk_type === "finalOutput") {
              const finalMessage: ChatMessage = {
                id: chunk.message_id || uniqueId(),
                messageType: "assistant",
                content: {
                  text: chunk.content.result.content ?? "-",
                },
                userId,
                chatId: id,
              };
              setMessages((messages) => [...messages, finalMessage]);

              if (onFinish) {
                onFinish(finalMessage);
              }
            }
          },
          async (error) => {
            if (onError) {
              await onError(error);
            }
          },
          abortController.signal,
          input
        );
        await postUserMessage(userMessage);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [api, handleAppendChat, id, input, isLoading, messages.length, onError, onFinish, userId]
  );

  // Check for ongoing stream on mount
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (messages?.length > 1 && lastMessage?.messageType !== "assistant") {
      setIsLoading(true);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      connectToStream(
        api,
        id,
        false,
        defaultOptions,
        (chunk) => {
          if (chunk.chunk_type === "step") {
            const stepMessage: ChatMessage = {
              id: chunk.messageId,
              messageType: chunk.chunk_type,
              content: {
                summary: chunk.summary,
                actionResult: chunk.actionResult,
              },
              userId,
              chatId: id,
            };
            setMessages((messages) => [...messages, stepMessage]);
          } else if (chunk.chunk_type === "finalOutput") {
            const finalMessage: ChatMessage = {
              id: chunk.message_id || uniqueId(),
              messageType: "assistant",
              content: {
                text: chunk.content.result.content ?? "-",
              },
              userId,
              chatId: id,
            };
            setMessages((messages) => [...messages, finalMessage]);

            if (onFinish) {
              onFinish(finalMessage);
            }
          }
        },
        async (error) => {
          if (onError) {
            await onError(error);
          }
        },
        abortController.signal
      ).finally(() => {
        setIsLoading(false);
        abortControllerRef.current = null;
      });
    }
  }, []);

  return {
    messages,
    isLoading,
    handleSubmit,
    handleInputChange,
    setMessages,
    input,
    setInput,
    stop,
  };
}
