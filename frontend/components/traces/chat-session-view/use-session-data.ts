import { useParams } from "next/navigation";
import { useEffect } from "react";
import { shallow } from "zustand/shallow";

import { useSessionViewStore } from "@/components/traces/session-view/store";

import { fetchSessionTraces } from "./session-api";

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
      setIsTracesLoading(true);
      setTracesError(undefined);
      try {
        // The thread renders the error in place of the turns, so no toast.
        const { traces, error } = await fetchSessionTraces(projectId, sessionId, controller.signal);
        if (traces) setTraces(traces);
        else setTracesError(error);
      } catch {
        // Aborted: a newer session or unmount superseded this load.
      } finally {
        if (!controller.signal.aborted) setIsTracesLoading(false);
      }
    })();
    return () => controller.abort();
  }, [projectId, sessionId, setTraces, setIsTracesLoading, setTracesError]);
}
