"use client";

import { ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import ClusterIcon from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import { jsonSchemaToSchemaFields, type SchemaField } from "@/components/signals/utils";
import { type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { useSpanRefCallbacks } from "@/components/traces/trace-view/span-reference/use-span-ref-callbacks";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import Markdown from "@/components/traces/trace-view/transcript/markdown.tsx";
import { useFeatureFlags } from "@/contexts/feature-flags-context.tsx";
import { getClusterColorById } from "@/lib/clusters/colors";
import { type EventRow } from "@/lib/events/types";
import { Feature } from "@/lib/features/features.ts";

import { schemaFieldsToStructuredOutput } from "./utils";

interface Props {
  traceId: string;
  signal: TraceSignal;
}

function parsePayload(payload: string): Record<string, unknown> {
  try {
    const result = JSON.parse(payload);
    if (result == null || typeof result !== "object" || Array.isArray(result)) {
      return {};
    }
    return result;
  } catch {
    return {};
  }
}

function PayloadValue({
  value,
  field,
  spanRefCallbacks,
}: {
  value: unknown;
  field: SchemaField;
  spanRefCallbacks?: SpanReferenceCallbacks;
}) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }
  switch (field.type) {
    case "boolean":
      return <span>{value ? "true" : "false"}</span>;
    case "enum":
      return (
        <span className="inline-flex items-center rounded-full border border-blue-400/30 px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {String(value)}
        </span>
      );
    case "number":
      return <span className="tabular-nums">{String(value)}</span>;
    case "string":
      return (
        <span className="whitespace-pre-wrap break-words">
          <Markdown contentClassName="pb-0" output={String(value)} spanRefCallbacks={spanRefCallbacks} />
        </span>
      );
  }
}

/** The per-signal body rendered inside a panel tab: the "Open in AI Chat" action
 *  plus the latest event's payload rendered field-by-field from the schema. */
export default function SignalDetails({ traceId, signal }: Props) {
  const { projectId } = useParams();
  const featureFlags = useFeatureFlags();
  const { selectSpanById, spans, openSignalInChat } = useTraceViewStore(
    (state) => ({
      selectSpanById: state.selectSpanById,
      spans: state.spans,
      openSignalInChat: state.openSignalInChat,
    }),
    shallow
  );

  const events = (signal.events as EventRow[]) ?? [];
  const latestEvent = events[0];

  const handleOpenInChat = () => {
    const signalDefinition = `### ${signal.signalName}\n${signal.prompt}`;
    const eventPayload = latestEvent ? latestEvent.payload : "No events found";
    openSignalInChat(signalDefinition, eventPayload);
  };

  const schemaFields = useMemo(
    () => jsonSchemaToSchemaFields(schemaFieldsToStructuredOutput(signal.schemaFields)),
    [signal.schemaFields]
  );
  const validFields = useMemo(() => schemaFields.filter((f) => f.name.trim()), [schemaFields]);
  const parsed = useMemo(() => (latestEvent ? parsePayload(latestEvent.payload) : {}), [latestEvent]);

  const spanRefCallbacks = useSpanRefCallbacks({
    spans,
    onSelectSpan: selectSpanById,
  });

  const leafClusters = signal.leafClusters ?? [];
  const signalBaseHref = `/project/${projectId}/signals/${signal.signalId}`;

  return (
    <div className="px-2 pt-2 pb-0.5 flex flex-col gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {leafClusters.length > 0 ? (
          leafClusters.map((cluster) => (
            <Link
              key={cluster.id}
              href={`${signalBaseHref}?clusterId=${cluster.id}&traceId=${traceId}`}
              target="_blank"
              className="group flex items-center gap-1.5 min-w-0 rounded-full bg-blue-400/8 border-blue-400/30 border px-2 py-1 hover:bg-blue-400/12"
            >
              <ClusterIcon iconVariant="box" color={getClusterColorById(cluster.id)} />
              <span className="truncate text-xs font-medium">{cluster.name}</span>
              <ArrowUpRight className="size-3.5 shrink-0" />
            </Link>
          ))
        ) : (
          <Link
            href={`${signalBaseHref}?traceId=${traceId}`}
            target="_blank"
            className="group flex items-center gap-1.5 min-w-0 rounded-full bg-blue-400/8 border-blue-400/30 border px-2 py-1 hover:bg-blue-400/12"
          >
            <span className="truncate text-xs font-medium">Open in Signals</span>
            <ArrowUpRight className="size-3.5 shrink-0" />
          </Link>
        )}
        {featureFlags[Feature.AGENT] && (
          <button
            type="button"
            onClick={handleOpenInChat}
            className="group flex items-center gap-1.5 min-w-0 rounded-full bg-blue-400/8 border-blue-400/30 border px-2 py-1 hover:bg-blue-400/12"
          >
            <Sparkles className="size-3.5 shrink-0" />
            <span className="truncate text-xs font-medium">Open in AI Chat</span>
          </button>
        )}
      </div>
      {!latestEvent ? (
        <div className="py-2 text-sm text-muted-foreground">No events found</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {validFields.map((field) => (
            <div key={field.name} className="flex flex-col gap-0.5">
              <div className="text-xs font-medium text-muted-foreground/80">{field.name}</div>
              <div className="text-sm leading-relaxed text-secondary-foreground">
                <PayloadValue value={parsed[field.name]} field={field} spanRefCallbacks={spanRefCallbacks} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
