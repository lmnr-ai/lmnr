import { useMemo, useState } from "react";

import { flattenScores } from "@/components/evaluation/utils";
import { type EvalRow } from "@/lib/evaluation/types";
import { useRealtime } from "@/lib/hooks/use-realtime";

/** The trial row plus its score names, kept current by the run's `datapoint_upsert` events. */
export function useLiveTrial(
  projectId: string,
  evaluationId: string,
  initialTrial: EvalRow,
  initialScoreNames: string[]
) {
  const [trial, setTrial] = useState(initialTrial);
  const [scoreNames, setScoreNames] = useState(initialScoreNames);
  const trialId = initialTrial["id"];

  const eventHandlers = useMemo(
    () => ({
      datapoint_upsert: (event: MessageEvent) => {
        const payload = JSON.parse(event.data) as { datapoints?: Array<EvalRow & { id: string }> };
        const incoming = payload.datapoints?.find((d) => d.id === trialId);
        if (!incoming) return;
        const flattened = flattenScores(incoming["scores"]);
        setTrial((prev) => ({ ...prev, ...incoming, ...flattened }));
        const names = Object.keys(flattened).map((key) => key.slice("score:".length));
        setScoreNames((prev) => {
          const added = names.filter((name) => !prev.includes(name));
          return added.length ? [...prev, ...added] : prev;
        });
      },
    }),
    [trialId]
  );

  useRealtime({ key: `evaluation_${evaluationId}`, projectId, eventHandlers });

  return { trial, scoreNames };
}
