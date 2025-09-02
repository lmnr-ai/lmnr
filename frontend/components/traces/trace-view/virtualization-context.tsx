"use client";

import { useVirtualizer, Virtualizer } from "@tanstack/react-virtual";
import React, { createContext, PropsWithChildren, useCallback, useContext, useRef, useState } from "react";

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
}

const Context = createContext<ContextValue | null>(null);

export function useVirtualizationContext() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useVirtualizationContext must be used within provider");
  return ctx;
}

export function VirtualizationProvider({ children }: PropsWithChildren) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [spanItems, setSpanItems] = useState<SpanItem[]>([]);
  const [renderProps, setRenderProps] = useState<RenderProps | null>(null);
  const [state, setState] = useState<State>({ totalHeight: 0, scrollTop: 0, viewportHeight: 0 });

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

  const virtualizer = useVirtualizer({
    count: spanItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 100,
    // useScrollendEvent: true,
    onChange: (instance) => {
      const el = scrollRef.current;
      if (!el) return;

      const newState = {
        totalHeight: instance.getTotalSize(),
        viewportHeight: el.clientHeight,
        scrollTop: el.scrollTop,
      };

      if (Object.values(newState).every((val) => isFinite(val) && val >= 0)) {
        setState(newState);
      }
    },
  });

  const scrollTo = useCallback((pos: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = pos;
    }
  }, []);

  return (
    <Context.Provider
      value={{
        state,
        virtualizer,
        scrollRef,
        spanItems,
        renderProps,
        scrollTo,
        render,
      }}
    >
      {children}
    </Context.Provider>
  );
}
