"use client";

import { createContext, type PropsWithChildren, useContext } from "react";

import { type SignalSparklineData } from "@/lib/actions/signals/stats";

interface SignalSparklineContextValue {
  data: SignalSparklineData;
  maxCount: number;
}

const SignalSparklineContext = createContext<SignalSparklineContextValue | null>(null);

export function SignalSparklineProvider({
  children,
  value,
}: PropsWithChildren<{ value: SignalSparklineContextValue }>) {
  return <SignalSparklineContext.Provider value={value}>{children}</SignalSparklineContext.Provider>;
}

export function useSignalSparklines() {
  const context = useContext(SignalSparklineContext);
  if (!context) throw new Error("useSignalSparklines must be used within SignalSparklineProvider");
  return context;
}
