"use client";

import { type PropsWithChildren, useState } from "react";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";

import { createUltimateTraceViewStore, type SeedTrace, UltimateTraceViewContext } from "./store";

// Creates the per-mount store and exposes it via context to the view's children.
export default function UltimateTraceViewProvider({
  children,
  seeds,
  initialTrace,
}: PropsWithChildren<{ seeds: SeedTrace[]; initialTrace?: TraceViewTrace }>) {
  const [store] = useState(() => createUltimateTraceViewStore(seeds, initialTrace));

  return <UltimateTraceViewContext.Provider value={store}>{children}</UltimateTraceViewContext.Provider>;
}
