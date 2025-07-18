// Fetching utilities - processing logic moved to @/lib/replayer/index.ts

export interface UrlChange {
  timestamp: number;
  url: string;
}

export interface EventProcessingResult {
  events: any[];
  urlChanges: UrlChange[];
  duration: number;
  startTime: number;
}

// Stream reading utility
const readEventStream = async (reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> => {
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const blob = new Blob(chunks, { type: "application/json" });
  return blob.text();
};

// Fetching function - now returns raw text for processing elsewhere
export async function fetchBrowserSessionRawData(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "GET",
    });

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("No reader available");
    }

    return await readEventStream(reader);
  } catch (e) {
    console.error("Error fetching browser session events:", e);
    throw e;
  }
}

// Legacy function for backward compatibility - delegates to ReplayController
export async function fetchBrowserSessionEvents(url: string): Promise<EventProcessingResult> {
  try {
    const rawText = await fetchBrowserSessionRawData(url);

    // Import here to avoid circular dependencies
    const { ReplayController } = await import("@/lib/replayer");
    const controller = new ReplayController();

    return controller.processRawSessionData(rawText);
  } catch (e) {
    console.error("Error fetching browser session events:", e);
    return { events: [], urlChanges: [], duration: 0, startTime: 0 };
  }
}
