import { useParams } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";

import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { type EventRow } from "@/lib/events/types";
import { swrFetcher } from "@/lib/utils";

type RawSignalResponse = {
  signalId: string;
  signalName: string;
  prompt: string;
  structuredOutput: Record<string, unknown>;
  color?: string | null;
  events: EventRow[];
};

export function useTraceSignals(traceId: string | undefined) {
  const { projectId } = useParams();

  const { data, isLoading } = useSWR<RawSignalResponse[]>(
    projectId && traceId ? `/api/projects/${projectId}/traces/${traceId}/signals` : null,
    swrFetcher
  );

  const signals: TraceSignal[] = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    return data.map((s) => ({
      signalId: s.signalId,
      signalName: s.signalName,
      prompt: s.prompt ?? "",
      color: s.color ?? null,
      schemaFields: jsonSchemaToSchemaFields(s.structuredOutput).map((f) => ({
        name: f.name,
        type: f.type,
        description: f.description,
      })),
      events: Array.isArray(s.events) ? s.events : [],
    }));
  }, [data]);

  return { signals, isLoading };
}
