import { uniqueId } from "lodash";
import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useCallback, useEffect, useRef, useState } from "react";
import { useSWRConfig } from "swr";

import { AgentSession, ChatMessage } from "@/components/chat/types";
import { connectToStream, initiateChat, stopSession } from "@/components/chat/utils";
import { toast } from "@/lib/hooks/use-toast";

interface UseAgentChatOptions {
  api?: string;
  id: string;
  userId: string;
  initialMessages?: ChatMessage[];
  agentStatus?: AgentSession["agentStatus"];
  onFinish?: (message: ChatMessage) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}

interface UseAgentChatHelpers {
  messages: ChatMessage[];
  isLoading: boolean;
  handleSubmit: (
    e?: FormEvent<HTMLFormElement>,
    options?: { model: string; enableThinking: boolean },
    submitInput?: string
  ) => Promise<void>;
  handleInputChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  stop: () => void;
  isControlled: boolean;
  setIsControlled: (isControlled: boolean) => void;
}

const defaultOptions = { model: "claude-3-7-sonnet-latest", enableThinking: true };

export function useAgentChat({
  api = "/api/agent",
  id,
  initialMessages = [],
  onFinish,
  onError,
  userId,
  agentStatus,
}: UseAgentChatOptions): UseAgentChatHelpers {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isControlled, setIsControlled] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { mutate } = useSWRConfig();
  const handleAppendChat = useCallback(
    async (chat: AgentSession) => {
      await mutate(
        "/api/agent-sessions",
        (sessions: AgentSession[] | undefined) => (sessions ? [chat, ...sessions] : [chat]),
        { revalidate: false, populateCache: true, rollbackOnError: true }
      );
    },
    [mutate]
  );

  const stop = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort("Chat stopped");
      abortControllerRef.current = null;
      await stopSession(id);
      setIsLoading(false);
    }
  }, [id]);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    async (
      e?: FormEvent<HTMLFormElement>,
      options?: { model: string; enableThinking: boolean },
      submitInput?: string
    ) => {
      if (e) {
        e.preventDefault();
      }

      const textToSubmit = submitInput ?? input;

      if (!textToSubmit.trim() || isLoading) {
        return;
      }

      const modelOptions = options ?? defaultOptions;

      setIsLoading(true);
      setInput("");
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        await initiateChat(messages, setMessages, handleAppendChat, textToSubmit, userId, id);
        await connectToStream(
          api,
          id,
          true,
          modelOptions,
          (chunk) => {
            if (chunk.chunkType === "step") {
              const stepMessage: ChatMessage = {
                id: chunk.messageId,
                messageType: chunk.chunkType,
                content: {
                  summary: chunk.summary,
                  actionResult: chunk.actionResult,
                },
                sessionId: id,
              };
              setMessages((messages) => [...messages, stepMessage]);
            } else if (chunk.chunkType === "finalOutput") {
              const finalMessage: ChatMessage = {
                id: chunk.messageId || uniqueId(),
                messageType: "assistant",
                content: {
                  text: chunk.content.result.content ?? "-",
                  actionResult: chunk.content.result,
                },
                sessionId: id,
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
          textToSubmit
        );
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [api, id, input, isLoading, messages.length, onError, onFinish, userId]
  );

  // Check for ongoing stream on mount
  useEffect(() => {
    if (messages?.length > 1 && agentStatus === "working") {
      setIsLoading(true);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      connectToStream(
        api,
        id,
        false,
        defaultOptions,
        (chunk) => {
          if (chunk.chunkType === "step") {
            const stepMessage: ChatMessage = {
              id: chunk.messageId,
              messageType: chunk.chunkType,
              content: {
                summary: chunk.summary,
                actionResult: chunk.actionResult,
              },
              sessionId: id,
            };
            setMessages((messages) => [...messages, stepMessage]);
          } else if (chunk.chunkType === "finalOutput") {
            const finalMessage: ChatMessage = {
              id: chunk.messageId || uniqueId(),
              messageType: "assistant",
              content: {
                text: chunk.content.result.content ?? "-",
                actionResult: chunk.content.result,
              },
              sessionId: id,
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
    isControlled,
    setIsControlled,
  };
}
