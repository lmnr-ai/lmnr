"use client";

import { useContext } from "react";
import { createStore } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type BaseTraceViewStore, TraceViewContext } from "@/components/traces/trace-view/store/base";
import { type SpanType } from "@/lib/traces/types";

const fallbackStore = createStore<Pick<BaseTraceViewStore, "spans">>(() => ({ spans: [] }));

export function useReactiveSpanType(spanUuid?: string): SpanType | undefined {
  const store = useContext(TraceViewContext) ?? fallbackStore;
  return useStoreWithEqualityFn(store, (state) =>
    spanUuid ? state.spans.find((s) => s.spanId === spanUuid)?.spanType : undefined
  );
}
