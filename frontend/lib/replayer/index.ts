import pako from "pako";
import { eventWithTime, IncrementalSource, Replayer } from "rrweb";

// Interfaces
type ReplaySnapshot = eventWithTime & {
  windowId: string;
};

interface SnapshotSourceResponse {
  snapshots: ReplaySnapshot[];
  processed?: boolean;
  sourceLoaded?: boolean;
}

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

// Event Processing Class - moved from utils.ts
class SessionEventProcessor {
  private cleanCssSplitMarkers(cssText: string): string {
    if (!cssText.includes("rr_split")) {
      return cssText;
    }
    return cssText.replace(/\/\*\s*rr_split\s*\*\//g, "");
  }

  private cleanCSSInNode(node: any): any {
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
        _cssText: this.cleanCssSplitMarkers(node.attributes._cssText),
      };
    }

    if (node.childNodes && Array.isArray(node.childNodes)) {
      cleaned.childNodes = node.childNodes.map((child: any) => this.cleanCSSInNode(child));
    }

    return cleaned;
  }

  private cleanMutationCSS(mutationData: any): any {
    if (!mutationData || typeof mutationData !== "object") {
      return mutationData;
    }

    const cleaned = { ...mutationData };

    if (cleaned.adds && Array.isArray(cleaned.adds)) {
      cleaned.adds = cleaned.adds.map((add: any) => ({
        ...add,
        node: this.cleanCSSInNode(add.node),
      }));
    }

    if (cleaned.attributes && Array.isArray(cleaned.attributes)) {
      cleaned.attributes = cleaned.attributes.map((attr: any) => {
        if (attr.attributes?._cssText && typeof attr.attributes._cssText === "string") {
          return {
            ...attr,
            attributes: {
              ...attr.attributes,
              _cssText: this.cleanCssSplitMarkers(attr.attributes._cssText),
            },
          };
        }
        return attr;
      });
    }

    return cleaned;
  }

  private cleanEventCssMarkers(eventData: any, eventType: number): any {
    if (!eventData || typeof eventData !== "object") {
      return eventData;
    }

    // Only process events that can contain CSS
    if (eventType === 2) {
      // FullSnapshot
      return {
        ...eventData,
        node: this.cleanCSSInNode(eventData.node),
      };
    } else if (eventType === 3) {
      // IncrementalSnapshot
      if (eventData.source === 0) {
        // Mutation
        return this.cleanMutationCSS(eventData);
      }
    }

    return eventData;
  }

  private tryDecompress(bytes: Uint8Array, fallback: string): string {
    try {
      return pako.ungzip(bytes, { to: "string" });
    } catch {
      return fallback;
    }
  }

  private extractUrlFromEvent(processedEvent: ProcessedEvent): string {
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
  }

  private processEvent(data: SessionEventData): ProcessedEvent | null {
    try {
      const parsedEvent = JSON.parse(data.text) as eventWithTime;
      const base64Data = parsedEvent.data as string;

      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const decompressedData = this.tryDecompress(bytes, binaryString);
      const eventData = JSON.parse(decompressedData) as eventWithTime["data"];
      const cleanedData = this.cleanEventCssMarkers(eventData, parsedEvent.type);

      return {
        data: cleanedData,
        timestamp: new Date(parsedEvent.timestamp + "Z").getTime(),
        type: parsedEvent.type,
      };
    } catch (e) {
      console.error("Error processing event:", e, data);
      return null;
    }
  }

  private calculateSessionTiming(events: ProcessedEvent[]): { duration: number; startTime: number } {
    if (events.length === 0) {
      return { duration: 0, startTime: 0 };
    }

    const startTime = events[0].timestamp;
    const endTime = events[events.length - 1].timestamp;
    const duration = (endTime - startTime) / 1000;

    return { duration, startTime };
  }

  public processBatchEvents(text: string): { events: ProcessedEvent[]; urlChanges: UrlChange[] } {
    let batchEvents: SessionEventData[][] = [];

    try {
      batchEvents = JSON.parse(text);
    } catch (e) {
      console.error("Error parsing events:", e);
      return { events: [], urlChanges: [] };
    }

    return batchEvents.flat().reduce<{ events: ProcessedEvent[]; urlChanges: UrlChange[]; lastUrl: string }>(
      (acc, eventData) => {
        const processedEvent = this.processEvent(eventData);
        if (!processedEvent) return acc;

        const url = this.extractUrlFromEvent(processedEvent);
        const shouldAddUrl = url && url !== acc.lastUrl;

        return {
          events: [...acc.events, processedEvent],
          urlChanges: shouldAddUrl ? [...acc.urlChanges, { timestamp: processedEvent.timestamp, url }] : acc.urlChanges,
          lastUrl: url || acc.lastUrl,
        };
      },
      { events: [], urlChanges: [], lastUrl: "" }
    );
  }

  public processRawSessionData(text: string): EventProcessingResult {
    const { events, urlChanges } = this.processBatchEvents(text);
    const { duration, startTime } = this.calculateSessionTiming(events);

    return { events, urlChanges, duration, startTime };
  }
}

// PostHog Style Processor (unchanged)
class PostHogStyleEventProcessor {
  private seenHashes = new Set<string>();

  // PostHog's cyrb53 hash function (exact copy)
  private cyrb53(str: string, seed = 0): number {
    let h1 = 0xdeadbeef ^ seed,
      h2 = 0x41c6ce57 ^ seed;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  private chunkMutationSnapshot(snapshot: ReplaySnapshot): ReplaySnapshot[] {
    if (
      snapshot.type === 3 &&
      snapshot.data.source === IncrementalSource.Mutation &&
      snapshot.data?.adds?.length > 100
    ) {
      const chunks: ReplaySnapshot[] = [];
      const chunkSize = 50;

      for (let i = 0; i < snapshot.data.adds.length; i += chunkSize) {
        chunks.push({
          ...snapshot,
          data: {
            ...snapshot.data,
            adds: snapshot.data.adds.slice(i, i + chunkSize),
          },
        });
      }
      return chunks;
    }

    return [snapshot];
  }

  processSnapshots(
    snapshots: ReplaySnapshot[],
    snapshotsBySource: Record<string, SnapshotSourceResponse> = {}
  ): Record<string, SnapshotSourceResponse> {
    const sourceKey = "single-source";

    console.log(snapshots.length);
    if (snapshotsBySource[sourceKey]?.processed) {
      return snapshotsBySource;
    }

    const result: ReplaySnapshot[] = [];

    const sortedSnapshots = snapshots.sort((a, b) => a.timestamp - b.timestamp);

    for (const snapshot of sortedSnapshots) {
      const { delay: _delay, ...delayFreeSnapshot } = snapshot as any;

      // Generate hash key for deduplication (PostHog's approach)
      const key = this.cyrb53(JSON.stringify(delayFreeSnapshot));

      if (this.seenHashes.has(key.toString())) {
        continue;
      }
      this.seenHashes.add(key.toString());

      // Apply chunking to the snapshot if needed
      const chunkedSnapshots = this.chunkMutationSnapshot(snapshot);
      result.push(...chunkedSnapshots);
    }

    // Sort final result by timestamp (PostHog does this)
    result.sort((a, b) => a.timestamp - b.timestamp);

    console.log(this.seenHashes.size);

    // Store processed snapshots
    snapshotsBySource[sourceKey] = {
      snapshots: result,
      processed: true,
      sourceLoaded: true,
    };

    return snapshotsBySource;
  }

  // Get processed snapshots (mirrors PostHog's pattern)
  getProcessedSnapshots(snapshotsBySource: Record<string, SnapshotSourceResponse>): ReplaySnapshot[] {
    const sourceKey = "single-source";
    return snapshotsBySource[sourceKey]?.snapshots || [];
  }
}

// Enhanced ReplayController with session event processing
export class ReplayController {
  private processor = new PostHogStyleEventProcessor();
  private sessionProcessor = new SessionEventProcessor();
  private snapshotsBySource: Record<string, SnapshotSourceResponse> = {};

  // Process raw session data from fetched text
  processRawSessionData(rawText: string): EventProcessingResult {
    return this.sessionProcessor.processRawSessionData(rawText);
  }

  // Convert ProcessedEvent[] to ReplaySnapshot[] and load them
  loadProcessedEvents(events: ProcessedEvent[]) {
    const snapshots = events as ReplaySnapshot[];
    this.snapshotsBySource = this.processor.processSnapshots(snapshots, this.snapshotsBySource);
  }

  // Original method for compatibility
  loadSnapshots(snapshots: ReplaySnapshot[]) {
    this.snapshotsBySource = this.processor.processSnapshots(snapshots, this.snapshotsBySource);
  }

  getSnapshots(): ReplaySnapshot[] {
    return this.processor.getProcessedSnapshots(this.snapshotsBySource);
  }

  startReplay(container: HTMLElement) {
    const processedSnapshots = this.getSnapshots();
    const replayer = new Replayer(processedSnapshots, {
      root: container,
    });
    replayer.play();
    return replayer;
  }
}

// Export the enhanced controller as default
export default ReplayController;
