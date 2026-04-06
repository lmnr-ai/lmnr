"use client";

import { createContext, type PropsWithChildren, useCallback, useContext, useState } from "react";

interface DashboardTraceState {
  traceId: string | null;
  spanId: string | null;
  openTrace: (traceId: string, spanId?: string) => void;
  closeTrace: () => void;
}

const DashboardTraceContext = createContext<DashboardTraceState | null>(null);

export const useDashboardTraceContext = (): DashboardTraceState => {
  const ctx = useContext(DashboardTraceContext);
  if (!ctx) {
    throw new Error("useDashboardTraceContext must be used within a DashboardTraceProvider");
  }
  return ctx;
};

export const DashboardTraceProvider = ({ children }: PropsWithChildren) => {
  const [traceId, setTraceId] = useState<string | null>(null);
  const [spanId, setSpanId] = useState<string | null>(null);

  const openTrace = useCallback((newTraceId: string, newSpanId?: string) => {
    setTraceId(newTraceId);
    setSpanId(newSpanId ?? null);
  }, []);

  const closeTrace = useCallback(() => {
    setTraceId(null);
    setSpanId(null);
  }, []);

  return (
    <DashboardTraceContext.Provider value={{ traceId, spanId, openTrace, closeTrace }}>
      {children}
    </DashboardTraceContext.Provider>
  );
};
