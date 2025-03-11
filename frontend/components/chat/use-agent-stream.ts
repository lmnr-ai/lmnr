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
  const streamAgent = async (prompt: string, onChunk: (data: any) => void) => {
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          enable_thinking: true,
          model: "claude-3-7-sonnet-latest",
          chatId: null,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body available");
      }

      const decoder = new TextDecoder();

      await streamReader(response.body, (chunk) => {
        const text = decoder.decode(chunk as unknown as Uint8Array);
        const lines = text.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr) {
              try {
                const data = JSON.parse(jsonStr);
                onChunk(data);
              } catch (e) {
                console.error("Failed to parse JSON:", e);
              }
            }
          }
        }
      });
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  };

  return { streamAgent };
}
