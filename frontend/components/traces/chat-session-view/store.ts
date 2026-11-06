import { create } from "zustand";
import { persist } from "zustand/middleware";

const MIN_TRACE_WIDTH = 480;
// Space always left for the chat thread beside the trace panel.
const MIN_THREAD_WIDTH = 360;
const DEFAULT_TRACE_WIDTH = 760;

/** Trace panel layout, persisted across sessions. Which trace is open lives in the URL (`useOpenTrace`). */
interface ChatViewLayoutState {
  traceWidth: number;
  containerWidth: number;
  resizeTrace: (delta: number) => void;
  setContainerWidth: (width: number) => void;
}

const clampWidth = (width: number, container: number) =>
  Math.max(MIN_TRACE_WIDTH, Math.min(width, Math.max(MIN_TRACE_WIDTH, container - MIN_THREAD_WIDTH)));

export const useChatViewStore = create<ChatViewLayoutState>()(
  persist(
    (set, get) => ({
      traceWidth: DEFAULT_TRACE_WIDTH,
      containerWidth: Infinity,
      resizeTrace: (delta) => set({ traceWidth: clampWidth(get().traceWidth + delta, get().containerWidth) }),
      setContainerWidth: (containerWidth) =>
        set({ containerWidth, traceWidth: clampWidth(get().traceWidth, containerWidth) }),
    }),
    { name: "chat-session-view-layout", partialize: (s) => ({ traceWidth: s.traceWidth }) }
  )
);
