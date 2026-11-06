import { useCallback } from "react";
import { shallow } from "zustand/shallow";

import { useSessionViewStore } from "@/components/traces/session-view/store";

import { useTurnData } from "./turn-data";

/** Reloads the per-turn details (agent output and span counts) of turns that changed live. */
export function useRefreshTurns() {
  const { invalidateAgentOutputs, fetchAgentOutputs } = useSessionViewStore(
    (s) => ({ invalidateAgentOutputs: s.invalidateAgentOutputs, fetchAgentOutputs: s.fetchAgentOutputs }),
    shallow
  );
  const { invalidateCounts, fetchCounts } = useTurnData(
    (s) => ({ invalidateCounts: s.invalidateCounts, fetchCounts: s.fetchCounts }),
    shallow
  );

  return useCallback(
    (traceIds: string[]) => {
      // Invalidate first: fetch skips ids that are still resolved.
      invalidateAgentOutputs(traceIds);
      invalidateCounts(traceIds);
      fetchAgentOutputs(traceIds);
      fetchCounts(traceIds);
    },
    [invalidateAgentOutputs, invalidateCounts, fetchAgentOutputs, fetchCounts]
  );
}
