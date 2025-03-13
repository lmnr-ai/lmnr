import { createParser } from "eventsource-parser";
import {uniqueId} from "lodash";
import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useCallback, useRef, useState } from "react";
import { v4 } from "uuid";

import { ActionResult, AgentState, ChatMessage, RunAgentResponseStreamChunk } from "@/components/chat/types";

interface UseAgentChatOptions {
  api?: string;
  id: string;
  userId: string;
  model: string;
  initialMessages?: ChatMessage[];
  onFinish?: (message: ChatMessage) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}

interface UseAgentChatHelpers {
  messages: ChatMessage[];
  agentState: AgentState | null;
  lastActionResult: ActionResult | null;
  isLoading: boolean;
  handleSubmit: (e?: FormEvent<HTMLFormElement>) => Promise<void>;
  handleInputChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  stop: () => void;
}

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

export function useAgentChat({
  api = "/api/agent",
  id,
  initialMessages = [],
  onFinish,
  onError,
  userId,
  model,
}: UseAgentChatOptions): UseAgentChatHelpers {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [lastActionResult, setLastActionResult] = useState<ActionResult | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    async (e?: FormEvent<HTMLFormElement>) => {
      if (e) {
        e.preventDefault();
      }

      if (!input.trim() || isLoading) {
        return;
      }

      setIsLoading(true);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;


      window.history.replaceState({}, '', `/chat/${id}`);

      const userMessage: ChatMessage = {
        id: v4(),
        messageType: "user",
        content: {
          text: input,
        },
        chatId: id,
        userId,
      };

      setMessages((messages) => [...messages, userMessage]);
      setInput("");

      await fetch('/api/agent_messages', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userMessage),
      });

      const response = await fetch(api, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: input,
          chatId: id,
          isNewUserMessage: messages.length <= 1,
          model,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No reader available");
      }

      try {
        const processStream = parseStream((chunk) => {
          if (chunk.chunk_type === "step") {
            setLastActionResult(chunk.actionResult);
            const stepMessage: ChatMessage = {
              id: chunk.messageId,
              messageType: chunk.chunk_type,
              content: {
                summary: chunk.summary,
                actionResult: chunk.actionResult
              },
              userId,
              chatId: id,
            };
            setMessages((messages) => [...messages, stepMessage]);
          } else if (chunk.chunk_type === "finalOutput") {
            setAgentState(chunk.content.state);
            const finalMessage: ChatMessage = {
              id: chunk.message_id || uniqueId(),
              messageType: 'assistant',
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
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          processStream(value);
        }

      } catch (error) {
        if (onError && error instanceof Error) {
          await onError(error);
        }
      } finally {
        reader.releaseLock();
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [api, id, input, isLoading, messages.length, onError, onFinish, userId]
  );

  return {
    messages,
    agentState,
    lastActionResult,
    isLoading,
    handleSubmit,
    handleInputChange,
    setMessages,
    input,
    setInput,
    stop,
  };
}
