import { createContext, useContext } from "react";

/**
 * What clicking a turn in a session preview does. Pages that can show a trace in place provide
 * this (the traces page opens its side panel); without it the trace opens in a new tab.
 */
const SelectTraceContext = createContext<((traceId: string) => void) | null>(null);

export const SessionPreviewSelectTraceProvider = SelectTraceContext.Provider;

export const useSelectSessionTrace = (projectId: string) => {
  const select = useContext(SelectTraceContext);
  return select ?? ((traceId: string) => window.open(`/project/${projectId}/traces/${traceId}`, "_blank"));
};
