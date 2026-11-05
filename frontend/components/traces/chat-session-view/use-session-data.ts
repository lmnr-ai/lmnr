import { useParams } from "next/navigation";
import { useEffect } from "react";
import { shallow } from "zustand/shallow";

import { useSessionViewStore } from "@/components/traces/session-view/store";
import { type TraceRow } from "@/lib/traces/types";

/** Loads a session's trace rows into the shared session store; per-turn details load as turns scroll into view. */
export function useSessionData(sessionId: string) {
  const { projectId } = useParams<{ projectId: string }>();
  const { setProjectId, setTraces, setIsTracesLoading, setTracesError } = useSessionViewStore(
    (s) => ({
      setProjectId: s.setProjectId,
      setTraces: s.setTraces,
      setIsTracesLoading: s.setIsTracesLoading,
      setTracesError: s.setTracesError,
    }),
    shallow
  );

  useEffect(() => setProjectId(projectId), [projectId, setProjectId]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        setIsTracesLoading(true);
        setTracesError(undefined);
        const res = await fetch(`/api/projects/${projectId}/sessions/${encodeURIComponent(sessionId)}/traces`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          setTracesError(err.error || "Failed to load session traces");
          return;
        }
        const body = (await res.json()) as { items: TraceRow[] };
        setTraces(body.items);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setTracesError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setIsTracesLoading(false);
      }
    })();
    return () => controller.abort();
  }, [projectId, sessionId, setTraces, setIsTracesLoading, setTracesError]);
}
