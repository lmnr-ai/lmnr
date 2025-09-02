import { UIEvent, useCallback, useRef } from "react";

interface ScrollSyncOptions {
  debounceDelay?: number;
}

export function useScrollSync({ debounceDelay = 100 }: ScrollSyncOptions = {}) {
  const activeScrollerRef = useRef<"tree" | "minimap" | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const createScrollHandler = useCallback(
    (
      source: "tree" | "minimap",
      syncFn: (scrollData: { scrollTop: number; scrollHeight: number; clientHeight: number }) => void
    ) =>
      (e: UIEvent<HTMLDivElement>) => {
        if (activeScrollerRef.current !== null && activeScrollerRef.current !== source) {
          return;
        }

        activeScrollerRef.current = source;

        clearTimeout(timeoutRef.current);

        timeoutRef.current = setTimeout(() => {
          activeScrollerRef.current = null;
        }, debounceDelay);

        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

        syncFn({ scrollTop, scrollHeight, clientHeight });
      },
    [debounceDelay]
  );

  return { createScrollHandler };
}
