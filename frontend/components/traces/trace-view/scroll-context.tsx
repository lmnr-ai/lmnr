"use client";

import { useVirtualizer, Virtualizer } from "@tanstack/react-virtual";
import React, { createContext, PropsWithChildren, UIEvent, useCallback, useContext, useRef, useState } from "react";

import { Span, Trace } from "@/lib/traces/types";

interface State {
  totalHeight: number;
  viewportHeight: number;
  scrollTop: number;
}

interface RenderProps {
  topLevelSpans: Span[];
  childSpans: { [key: string]: Span[] };
  activeSpans: string[];
  collapsedSpans: Set<string>;
  containerWidth: number;
  selectedSpan: Span | null;
  trace: Trace | null;
  onToggleCollapse: (spanId: string) => void;
  onSpanSelect: (span: Span) => void;
  onSelectTime?: (time: number) => void;
}

interface SpanItem {
  span: Span;
  depth: number;
  yOffset: number;
  parentY: number;
}

interface ContextValue {
  state: State;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  spanItems: SpanItem[];
  renderProps: RenderProps | null;
  scrollTo: (pos: number) => void;
  render: (props: RenderProps) => void;
  updateState: (newState: Partial<State>) => void;
  createScrollHandler: (
    source: "tree" | "minimap",
    syncFn: (scrollData: { scrollTop: number; scrollHeight: number; clientHeight: number }) => void
  ) => (e: UIEvent<HTMLDivElement>) => void;
}

const ScrollContext = createContext<ContextValue | null>(null);

export function useScrollContext() {
  const ctx = useContext(ScrollContext);
  if (!ctx) throw new Error("useScrollContext must be used within provider");
  return ctx;
}

const DEBOUNCED_DELAY = 100;

export function ScrollContextProvider({ children }: PropsWithChildren) {
  const [spanItems, setSpanItems] = useState<SpanItem[]>([]);
  const [renderProps, setRenderProps] = useState<RenderProps | null>(null);
  const [state, setState] = useState<State>({ totalHeight: 0, scrollTop: 0, viewportHeight: 0 });

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeScrollerRef = useRef<"tree" | "minimap" | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const virtualizer = useVirtualizer({
    count: spanItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 100,
  });

  const render = useCallback((props: RenderProps) => {
    const newSpanItems: SpanItem[] = [];
    const maxY = { current: 0 };

    const buildTreeWithCollapse = (
      items: SpanItem[],
      span: Span,
      depth: number,
      maxY: { current: number },
      parentY: number
    ) => {
      const yOffset = maxY.current + 36;

      items.push({
        span,
        depth,
        yOffset,
        parentY,
      });

      maxY.current = maxY.current + 36;

      if (!props.collapsedSpans.has(span.spanId)) {
        const py = maxY.current;
        props.childSpans[span.spanId]?.forEach((child) => buildTreeWithCollapse(items, child, depth + 1, maxY, py));
      }
    };

    props.topLevelSpans.forEach((span) => buildTreeWithCollapse(newSpanItems, span, 0, maxY, 0));

    setSpanItems(newSpanItems);
    setRenderProps(props);
  }, []);

  const scrollTo = useCallback((pos: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = pos;
    }
  }, []);

  const updateState = useCallback((newState: Partial<State>) => {
    setState((prev: State) => ({ ...prev, ...newState }));
  }, []);

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
        }, DEBOUNCED_DELAY);

        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

        syncFn({ scrollTop, scrollHeight, clientHeight });
      },
    []
  );

  return (
    <ScrollContext.Provider
      value={{
        state,
        virtualizer,
        scrollRef,
        spanItems,
        renderProps,
        scrollTo,
        render,
        updateState,
        createScrollHandler,
      }}
    >
      {children}
    </ScrollContext.Provider>
  );
}
