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
import { type TraceSignal, type TraceSignalEvent } from "@/components/traces/trace-view/store/base";
import Markdown from "@/components/traces/trace-view/transcript/markdown.tsx";
import { Badge } from "@/components/ui/badge";
import { useFeatureFlags } from "@/contexts/feature-flags-context.tsx";
import { SEVERITY_LABELS } from "@/lib/actions/alerts/types";
import { getClusterColorById } from "@/lib/clusters/colors";
import { Feature } from "@/lib/features/features.ts";
import { cn } from "@/lib/utils";

import { schemaFieldsToStructuredOutput } from "./utils";

const SEVERITY_STYLES: Record<number, string> = {
  0: "text-muted-foreground/60",
  1: "text-orange-400/80",
  2: "text-red-400",
};

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

/** One finding card: the event's severity + its own leaf cluster link, then the
 *  event payload rendered field-by-field from the signal's schema. */
function FindingCard({
  event,
  projectId,
  signalId,
  traceId,
  validFields,
  spanRefCallbacks,
}: {
  event: TraceSignalEvent;
  projectId: string;
  signalId: string;
  traceId: string;
  validFields: SchemaField[];
  spanRefCallbacks?: SpanReferenceCallbacks;
}) {
  const parsed = useMemo(() => parsePayload(event.payload), [event.payload]);
  const leafCluster = event.leafCluster;
  const severityLabel = SEVERITY_LABELS[event.severity as keyof typeof SEVERITY_LABELS] ?? "Info";
  const severityClassName = SEVERITY_STYLES[event.severity] ?? SEVERITY_STYLES[0];
  const clusterHref = leafCluster
    ? `/project/${projectId}/signals/${signalId}?clusterId=${leafCluster.id}&traceId=${traceId}&eventId=${event.id}`
    : undefined;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border p-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className={cn("rounded-full font-medium", severityClassName)}>
          {severityLabel}
        </Badge>
        {leafCluster && clusterHref && (
          <Link
            href={clusterHref}
            target="_blank"
            className="group flex items-center gap-1.5 min-w-0 rounded-full bg-blue-400/8 border-blue-400/30 border px-2 py-1 hover:bg-blue-400/12"
          >
            <ClusterIcon iconVariant="box" color={getClusterColorById(leafCluster.id)} />
            <span className="truncate text-xs font-medium">{leafCluster.name}</span>
            <ArrowUpRight className="size-3.5 shrink-0" />
          </Link>
        )}
      </div>
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
    </div>
  );
}

/** The per-signal body rendered inside a panel tab: the "Open in Signals" / "Open
 *  in AI Chat" actions plus one finding card per event, each rendered
 *  field-by-field from the schema. */
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

  const events = signal.events ?? [];
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

  const spanRefCallbacks = useSpanRefCallbacks({
    spans,
    onSelectSpan: selectSpanById,
  });

  const signalHref = `/project/${projectId}/signals/${signal.signalId}?traceId=${traceId}`;

  return (
    <div className="px-2 pt-2 pb-0.5 flex flex-col gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Link
          href={signalHref}
          target="_blank"
          className="group flex items-center gap-1.5 min-w-0 rounded-full bg-blue-400/8 border-blue-400/30 border px-2 py-1 hover:bg-blue-400/12"
        >
          <span className="truncate text-xs font-medium">Open in Signals</span>
          <ArrowUpRight className="size-3.5 shrink-0" />
        </Link>
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
      {events.length === 0 ? (
        <div className="py-2 text-sm text-muted-foreground">No events found</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {events.map((event) => (
            <FindingCard
              key={event.id}
              event={event}
              projectId={projectId as string}
              signalId={signal.signalId}
              traceId={traceId}
              validFields={validFields}
              spanRefCallbacks={spanRefCallbacks}
            />
          ))}
        </div>
      )}
    </div>
  );
}
