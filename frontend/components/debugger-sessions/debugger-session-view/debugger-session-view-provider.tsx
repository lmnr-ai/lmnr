"use client";

import { type PropsWithChildren, useState } from "react";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";

import { createDebuggerSessionViewStore, DebuggerSessionViewContext, type SeedTrace } from "./store";

// Creates the per-mount store and exposes it via context to the view's children.
export default function DebuggerSessionViewProvider({
  children,
  seeds,
  initialTrace,
}: PropsWithChildren<{ seeds: SeedTrace[]; initialTrace?: TraceViewTrace }>) {
  const [store] = useState(() => createDebuggerSessionViewStore(seeds, initialTrace));

  return <DebuggerSessionViewContext.Provider value={store}>{children}</DebuggerSessionViewContext.Provider>;
}
