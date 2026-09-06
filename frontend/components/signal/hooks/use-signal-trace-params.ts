"use client";

import { createSerializer, parseAsString, useQueryStates } from "nuqs";

export const signalTraceParsers = {
  traceId: parseAsString,
  eventId: parseAsString,
  spanId: parseAsString,
};

export const serializeSignalTraceQuery = createSerializer(signalTraceParsers);

export type SignalTraceParams = {
  traceId: string | null;
  eventId: string | null;
  spanId: string | null;
};

export function useSignalTraceParams() {
  return useQueryStates(signalTraceParsers, { history: "push" });
}

export function signalTraceHref(pathName: string, search: string, values: SignalTraceParams): string {
  const base = search ? `${pathName}?${search}` : pathName;
  return serializeSignalTraceQuery(base, values);
}
