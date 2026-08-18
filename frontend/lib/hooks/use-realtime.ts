import { useEffect, useRef } from "react";

type RealtimeEventHandler = (event: MessageEvent) => void;

interface UseRealtimeOptions {
  key: string;
  projectId: string;
  eventHandlers: Record<string, RealtimeEventHandler>;
  enabled?: boolean;
  onConnect?: () => void;
  onError?: (error: Event) => void;
}

export function useRealtime({ key, projectId, eventHandlers, enabled = true, onConnect, onError }: UseRealtimeOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const handlersRef = useRef(eventHandlers);
  const onConnectRef = useRef(onConnect);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    handlersRef.current = eventHandlers;
    onConnectRef.current = onConnect;
    onErrorRef.current = onError;
  }, [eventHandlers, onConnect, onError]);

  const eventNames = Object.keys(eventHandlers).sort().join(",");

  useEffect(() => {
    if (!enabled || !projectId) {
      return;
    }

    const eventSource = new EventSource(`/api/projects/${projectId}/realtime?key=${key}`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("open", () => {
      onConnectRef.current?.();
    });

    for (const eventName of eventNames.split(",").filter(Boolean)) {
      eventSource.addEventListener(eventName, (event) => {
        try {
          handlersRef.current[eventName]?.(event);
        } catch {
          // Handler threw; don't tear down the SSE connection.
        }
      });
    }

    eventSource.addEventListener("error", (error) => {
      onErrorRef.current?.(error);
    });

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [key, projectId, enabled, eventNames]);

  return {
    close: () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    },
  };
}
