import { createContext, type PropsWithChildren, useContext } from "react";

import { type SpanAverageStats } from "@/lib/actions/trace/averages";

const SpanAveragesContext = createContext<SpanAverageStats | null>(null);

export function SpanAveragesProvider({ children, averages }: PropsWithChildren<{ averages: SpanAverageStats | null }>) {
  return <SpanAveragesContext.Provider value={averages}>{children}</SpanAveragesContext.Provider>;
}

export function useSpanAveragesContext() {
  return useContext(SpanAveragesContext);
}
