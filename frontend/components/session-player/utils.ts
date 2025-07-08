import pako from "pako";
import { eventWithTime as EventWithTime } from "rrweb";

export interface ProcessedEvent {
  data: any;
  timestamp: number;
  type: number;
}

export interface SessionEventData {
  text: string;
}

export interface UrlChange {
  timestamp: number;
  url: string;
}

export interface EventProcessingResult {
  events: ProcessedEvent[];
  urlChanges: UrlChange[];
  duration: number;
  startTime: number;
}

const cleanCssSplitMarkers = (cssText: string): string => {
  if (!cssText.includes("rr_split")) {
    return cssText;
  }
  return cssText.replace(/\/\*\s*rr_split\s*\*\//g, "");
};

const cleanCSSInNode = (node: any): any => {
  if (!node || typeof node !== "object") {
    return node;
  }

  const cleaned = { ...node };

  // Check if this is a style element with _cssText
  if (
    (node.tagName === "style" || node.tagName === "STYLE") &&
    node.attributes?._cssText &&
    typeof node.attributes._cssText === "string"
  ) {
    cleaned.attributes = {
      ...node.attributes,
      _cssText: cleanCssSplitMarkers(node.attributes._cssText),
    };
  }

  if (node.childNodes && Array.isArray(node.childNodes)) {
    cleaned.childNodes = node.childNodes.map((child: any) => cleanCSSInNode(child));
  }

  return cleaned;
};

const cleanMutationCSS = (mutationData: any): any => {
  if (!mutationData || typeof mutationData !== "object") {
    return mutationData;
  }

  const cleaned = { ...mutationData };

  if (cleaned.adds && Array.isArray(cleaned.adds)) {
    cleaned.adds = cleaned.adds.map((add: any) => ({
      ...add,
      node: cleanCSSInNode(add.node),
    }));
  }

  if (cleaned.attributes && Array.isArray(cleaned.attributes)) {
    cleaned.attributes = cleaned.attributes.map((attr: any) => {
      if (attr.attributes?._cssText && typeof attr.attributes._cssText === "string") {
        return {
          ...attr,
          attributes: {
            ...attr.attributes,
            _cssText: cleanCssSplitMarkers(attr.attributes._cssText),
          },
        };
      }
      return attr;
    });
  }

  return cleaned;
};

const cleanEventCssMarkers = (eventData: any, eventType: number): any => {
  if (!eventData || typeof eventData !== "object") {
    return eventData;
  }

  // Only process events that can contain CSS
  if (eventType === 2) {
    // FullSnapshot
    return {
      ...eventData,
      node: cleanCSSInNode(eventData.node),
    };
  } else if (eventType === 3) {
    // IncrementalSnapshot
    if (eventData.source === 0) {
      // Mutation
      return cleanMutationCSS(eventData);
    }
  }

  return eventData;
};

const tryDecompress = (bytes: Uint8Array, fallback: string): string => {
  try {
    return pako.ungzip(bytes, { to: "string" });
  } catch {
    return fallback;
  }
};

const extractUrlFromEvent = (processedEvent: ProcessedEvent): string => {
  const { type, data } = processedEvent;

  if (!data?.href) return "";

  switch (type) {
    case 4: // Meta events
    case 2: // Full snapshot
      return data.href;
    case 3: // Incremental snapshot
      return data.source === 0 ? data.href : "";
    default:
      return data.type === "navigation" ? data.href : "";
  }
};

const processEvent = (data: SessionEventData): ProcessedEvent | null => {
  try {
    const parsedEvent = JSON.parse(data.text) as EventWithTime;
    const base64Data = parsedEvent.data as string;

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const decompressedData = tryDecompress(bytes, binaryString);
    const eventData = JSON.parse(decompressedData) as EventWithTime["data"];
    const cleanedData = cleanEventCssMarkers(eventData, parsedEvent.type);

    return {
      data: cleanedData,
      timestamp: new Date(parsedEvent.timestamp + "Z").getTime(),
      type: parsedEvent.type,
    };
  } catch (e) {
    console.error("Error processing event:", e, data);
    return null;
  }
};

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

const processBatchEvents = (text: string): { events: ProcessedEvent[]; urlChanges: UrlChange[] } => {
  let batchEvents: SessionEventData[][] = [];

  try {
    batchEvents = JSON.parse(text);
  } catch (e) {
    console.error("Error parsing events:", e);
    return { events: [], urlChanges: [] };
  }

  return batchEvents.flat().reduce<{ events: ProcessedEvent[]; urlChanges: UrlChange[]; lastUrl: string }>(
    (acc, eventData) => {
      const processedEvent = processEvent(eventData);
      if (!processedEvent) return acc;

      const url = extractUrlFromEvent(processedEvent);
      const shouldAddUrl = url && url !== acc.lastUrl;

      return {
        events: [...acc.events, processedEvent],
        urlChanges: shouldAddUrl ? [...acc.urlChanges, { timestamp: processedEvent.timestamp, url }] : acc.urlChanges,
        lastUrl: url || acc.lastUrl,
      };
    },
    { events: [], urlChanges: [], lastUrl: "" }
  );
};

const calculateSessionTiming = (events: ProcessedEvent[]): { duration: number; startTime: number } => {
  if (events.length === 0) {
    return { duration: 0, startTime: 0 };
  }

  const startTime = events[0].timestamp;
  const endTime = events[events.length - 1].timestamp;
  const duration = (endTime - startTime) / 1000;

  return { duration, startTime };
};

export async function fetchBrowserSessionEvents(url: string): Promise<EventProcessingResult> {
  try {
    const res = await fetch(url, {
      method: "GET",
    });

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("No reader available");
    }

    const text = await readEventStream(reader);
    const { events, urlChanges } = processBatchEvents(text);
    const { duration, startTime } = calculateSessionTiming(events);

    return { events, urlChanges, duration, startTime };
  } catch (e) {
    console.error("Error fetching browser session events:", e);
    return { events: [], urlChanges: [], duration: 0, startTime: 0 };
  }
}
