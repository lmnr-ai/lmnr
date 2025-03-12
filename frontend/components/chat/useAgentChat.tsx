import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useCallback, useRef, useState } from "react";
import { v4 } from "uuid";

import { ActionResult, AgentState, ChatMessage, RunAgentResponseStreamChunk } from "@/components/chat/types";

interface UseAgentChatOptions {
  api?: string;
  id?: string;
  initialMessages?: ChatMessage[];
  onResponse?: (response: Response) => void | Promise<void>;
  onFinish?: (message: ChatMessage) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}

interface UseAgentChatHelpers {
  messages: ChatMessage[];
  agentState: AgentState | null;
  lastActionResult: ActionResult | null;
  isLoading: boolean;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  handleInputChange?: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  stop: () => void;
}

export function useAgentChat({
  api = "/api/agent",
  id,
  initialMessages = [],
  onResponse,
  onFinish,
  onError,
}: UseAgentChatOptions = {}): UseAgentChatHelpers {
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
    }
  }, []);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      if (!input.trim() || isLoading) {
        return;
      }

      setIsLoading(true);
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // Add user message to the list
        const userMessage: ChatMessage = {
          id: v4(),
          role: "user",
          content: input,
          isStateMessage: false,
        };
        setMessages((messages) => [...messages, userMessage]);
        setInput("");

        const response = await fetch(api, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            prompt: input,
            chatId: id || crypto.randomUUID(),
            isNewChat: messages.length === 0,
            model: "claude-3-7-sonnet-latest",
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        if (onResponse) {
          await onResponse(response);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No reader available");
        }

        const decoder = new TextDecoder();
        let accumulatedData = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          accumulatedData += text;

          const lines = accumulatedData.split("\n");
          accumulatedData = lines.pop() || ""; // Keep the last incomplete line

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.slice(6).trim();
              if (jsonStr) {
                try {
                  const chunk = JSON.parse(jsonStr) as RunAgentResponseStreamChunk;

                  if (chunk.chunk_type === "step") {
                    setLastActionResult(chunk.actionResult);
                    // Add assistant message for the step
                    const stepMessage: ChatMessage = {
                      id: chunk.messageId,
                      role: "assistant",
                      content: chunk.summary,
                      isStateMessage: false,
                    };
                    setMessages((messages) => [...messages, stepMessage]);
                  } else if (chunk.chunk_type === "finalOutput") {
                    setAgentState(chunk.content.state);
                    const finalMessage: ChatMessage = {
                      id: chunk.messageId,
                      role: "assistant",
                      content: chunk.content.result.content ?? "-",
                      isStateMessage: true,
                    };
                    setMessages((messages) => [...messages, finalMessage]);
                    if (onFinish) {
                      await onFinish(finalMessage);
                    }
                  }
                } catch (e) {
                  console.error("Failed to parse JSON:", e);
                }
              }
            }
          }
        }
      } catch (error) {
        if (onError && error instanceof Error) {
          await onError(error);
        }
        console.error("Error in chat:", error);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [api, id, input, isLoading, messages.length, onError, onFinish, onResponse]
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
