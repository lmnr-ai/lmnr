import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseAsString, useQueryStates } from "nuqs";
import { useCallback } from "react";

import { useSessionViewStore } from "@/components/traces/session-view/store";
import { deleteTraceViewParams } from "@/components/traces/trace-view/use-trace-view-tab";

const openTraceParams = { traceId: parseAsString, spanId: parseAsString };

/** The turn whose trace panel is open; lives in the URL so it survives refresh, back, and sharing. */
export function useOpenTrace() {
  const [{ traceId, spanId }, setParams] = useQueryStates(openTraceParams, { history: "push" });
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();
  const setTraceExpanded = useSessionViewStore((s) => s.setTraceExpanded);
  const setSelectedSpan = useSessionViewStore((s) => s.setSelectedSpan);

  const closeTrace = useCallback(() => {
    // Also collapse the trace's timeline segment and drop the timeline's span selection.
    if (traceId) setTraceExpanded(traceId, false);
    setSelectedSpan(undefined);
    // Rebuilt without the hash (unlike nuqs), so a `#output-N` message link closes with its trace.
    const params = new URLSearchParams(searchParams);
    params.delete("traceId");
    params.delete("spanId");
    deleteTraceViewParams(params);
    const query = params.toString();
    router.push(query ? `${pathName}?${query}` : pathName);
  }, [traceId, setTraceExpanded, setSelectedSpan, searchParams, router, pathName]);

  const toggleTrace = useCallback(
    (id: string) => (id === traceId ? closeTrace() : void setParams({ traceId: id, spanId: null })),
    [traceId, closeTrace, setParams]
  );

  const openSpan = useCallback(
    (nextTraceId: string, nextSpanId: string) => void setParams({ traceId: nextTraceId, spanId: nextSpanId }),
    [setParams]
  );

  return { openTraceId: traceId ?? undefined, openSpanId: spanId ?? undefined, toggleTrace, openSpan, closeTrace };
}
