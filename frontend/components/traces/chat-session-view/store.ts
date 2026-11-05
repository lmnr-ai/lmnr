import { create } from "zustand";
import { persist } from "zustand/middleware";

const MIN_TRACE_WIDTH = 480;
// Space always left for the chat thread beside the trace panel.
const MIN_THREAD_WIDTH = 360;
const DEFAULT_TRACE_WIDTH = 760;

// The thread is always open; clicking a turn's "Worked" row (or a timeline span)
// slides that trace's view in beside it.
export type StatsPosition = "middle" | "below";

interface ChatViewState {
  openTraceId?: string;
  /** Where a turn's duration/tokens/cost sit: in the work row, or under the reply. Set from the DialKit panel. */
  statsPosition: StatsPosition;
  setStatsPosition: (position: StatsPosition) => void;
  openSpanId?: string;
  traceWidth: number;
  containerWidth: number;
  toggleTrace: (traceId?: string) => void;
  openSpan: (traceId: string, spanId: string) => void;
  resizeTrace: (delta: number) => void;
  setContainerWidth: (width: number) => void;
  reset: () => void;
}

const clampWidth = (width: number, container: number) =>
  Math.max(MIN_TRACE_WIDTH, Math.min(width, Math.max(MIN_TRACE_WIDTH, container - MIN_THREAD_WIDTH)));

export const useChatViewStore = create<ChatViewState>()(
  persist(
    (set, get) => ({
      openTraceId: undefined,
      openSpanId: undefined,
      statsPosition: "below",
      setStatsPosition: (statsPosition) => set({ statsPosition }),
      traceWidth: DEFAULT_TRACE_WIDTH,
      containerWidth: Infinity,
      toggleTrace: (traceId) =>
        set({ openTraceId: traceId === get().openTraceId ? undefined : traceId, openSpanId: undefined }),
      openSpan: (openTraceId, openSpanId) => set({ openTraceId, openSpanId }),
      resizeTrace: (delta) => set({ traceWidth: clampWidth(get().traceWidth + delta, get().containerWidth) }),
      setContainerWidth: (containerWidth) =>
        set({ containerWidth, traceWidth: clampWidth(get().traceWidth, containerWidth) }),
      reset: () => set({ openTraceId: undefined, openSpanId: undefined }),
    }),
    { name: "chat-session-view-layout", partialize: (s) => ({ traceWidth: s.traceWidth }) }
  )
);
