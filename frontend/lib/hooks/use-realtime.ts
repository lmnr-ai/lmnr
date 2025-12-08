import { useEffect, useRef } from "react";

type RealtimeEventHandler<T = any> = (data: T) => void;

interface UseRealtimeOptions {
  key: string;
  projectId: string;
  eventHandlers: Record<string, RealtimeEventHandler>;
  enabled?: boolean;
  onConnect?: () => void;
  onError?: (error: Event) => void;
}

export function useRealtime({
  key,
  projectId,
  eventHandlers,
  enabled = true,
  onConnect,
  onError,
}: UseRealtimeOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !projectId) {
      return;
    }

    const eventSource = new EventSource(`/api/projects/${projectId}/realtime?key=${key}`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("open", () => {
      onConnect?.();
    });

    Object.entries(eventHandlers).forEach(([eventName, handler]) => {
      eventSource.addEventListener(eventName, (event) => {
        try {
          handler(event);
        } catch (error) {
          console.error(`Error processing ${eventName} event:`, error);
        }
      });
    });

    eventSource.addEventListener("error", (error) => {
      console.error("SSE connection error:", error);
      onError?.(error);
    });

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [key, projectId, enabled, eventHandlers, onConnect, onError]);

  return {
    close: () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    },
  };
}
