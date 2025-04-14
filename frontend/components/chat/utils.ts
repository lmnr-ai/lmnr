import { createParser } from "eventsource-parser";
import { SetStateAction } from "react";
import { v4 } from "uuid";

import { AgentSession, ChatMessage, RunAgentResponseStreamChunk } from "@/components/chat/types";

export const connectToStream = async (
  api: string,
  sessionId: string,
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
      sessionId,
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

export const generateChatName = async (input: string) => {
  const response = await fetch("/api/completion", {
    method: "POST",
    body: JSON.stringify({
      prompt: `Summarize the following message into a brief 3-5 word title, focusing on the main topic or question: "${input}"`,
    }),
  });
  if (!response.ok) {
    // Fallback if we couldn't call the language model
    return input.slice(0, 50).trim().replace(/["\n]/g, "");
  }

  const result = (await response.json()) as { text: string };

  return result?.text.trim().replace(/["\n]/g, "") ?? "New Chat";
};

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

export const createMessage = async (message: ChatMessage) => {
  const response = await fetch("/api/agent-messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
};

export const createChat = async (chat: AgentSession) => {
  try {
    await fetch(`/api/agent-sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chat),
    });
  } catch (e) {
    console.error(e);
  }
};

export const stopSession = async (sessionId: string) => {
  try {
    await fetch(`/api/agent/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });
  } catch (e) {
    console.error(e);
  }
};

export const initiateChat = async (
  messages: ChatMessage[],
  setMessages: (value: SetStateAction<ChatMessage[]>) => void,
  appendChat: (chat: AgentSession) => Promise<void>,
  input: string,
  userId: string,
  sessionId: string
) => {
  const userMessage: ChatMessage = {
    id: v4(),
    messageType: "user",
    content: {
      text: input,
      actionResult: {
        isDone: false,
      },
    },
    sessionId,
    createdAt: new Date().toISOString(),
  };

  setMessages((messages) => [...messages, userMessage]);

  if (messages.length <= 1) {
    const name = await generateChatName(input);
    await createChat({ sessionId: sessionId, chatName: name, userId });
    const optimisticChat: AgentSession = {
      updatedAt: new Date().toISOString(),
      chatName: name,
      userId,
      sessionId: sessionId,
      isNew: true,
      agentStatus: "working",
    };
    await appendChat(optimisticChat);
  }

  window.history.replaceState({}, "", `/chat/${sessionId}`);

  await createMessage(userMessage);
};
