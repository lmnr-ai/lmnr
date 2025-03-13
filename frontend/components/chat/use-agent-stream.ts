import { RunAgentResponseStreamChunk, StreamAgentRequest } from "@/components/chat/types";

const streamReader = async (
  stream: ReadableStream<Uint8Array>,
  onChunk: (chunk: Uint8Array) => void | Promise<void>
) => {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await onChunk(value);
    }
  } catch (error) {
    throw error;
  } finally {
    reader.releaseLock();
  }
};

export function useAgentStream() {
  const streamAgent = async (prompt: string, onChunk: (data: RunAgentResponseStreamChunk) => void) => {
    const request: StreamAgentRequest = {
      prompt,
      model: "claude-3-7-sonnet-latest",
      chatId: "0e5b4d61-7a0e-47f9-ad4b-d1203899f485",
      isNewChat: true,
    };

    const response = await fetch("/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    const decoder = new TextDecoder();

    if (!response.body) {
      throw new Error("Response body is null");
    }

    await streamReader(response.body, (chunk) => {
      const text = decoder.decode(chunk as unknown as Uint8Array);
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (jsonStr) {
            try {
              const data = JSON.parse(jsonStr) as RunAgentResponseStreamChunk;
              onChunk(data);
            } catch (e) {
              console.error("Failed to parse JSON:", e);
            }
          }
        }
      }
    });
  };

  return { streamAgent };
}
