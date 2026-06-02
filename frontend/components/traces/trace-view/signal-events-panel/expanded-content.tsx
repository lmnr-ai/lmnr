"use client";

import { motion } from "framer-motion";
import { ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { shallow } from "zustand/shallow";

import { jsonSchemaToSchemaFields, type SchemaField } from "@/components/signals/utils";
import { renderSpanReferences, type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import { useSpanRefCallbacks } from "@/components/traces/trace-view/span-reference/use-span-ref-callbacks";
import { useTraceViewStore } from "@/components/traces/trace-view/store";
import { type TraceSignal } from "@/components/traces/trace-view/store/base";
import { Button } from "@/components/ui/button";
import { type EventRow } from "@/lib/events/types";

import { usePanelHover } from "./hover-context";
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
      return <span className="text-secondary-foreground">{value ? "true" : "false"}</span>;
    case "enum":
      return (
        <span className="inline-flex items-center rounded-full border border-blue-400/40 px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {String(value)}
        </span>
      );
    case "number":
      return <span className="tabular-nums text-secondary-foreground">{String(value)}</span>;
    case "string": {
      const text = String(value);
      if (spanRefCallbacks) {
        const rendered = renderSpanReferences(text, spanRefCallbacks);
        if (rendered) {
          return (
            <span className="whitespace-pre-wrap break-words text-secondary-foreground leading-5">{rendered}</span>
          );
        }
      }
      return <span className="whitespace-pre-wrap break-words text-secondary-foreground leading-5">{text}</span>;
    }
  }
}

export default function ExpandedContent({ traceId, signal }: Props) {
  const { projectId } = useParams();
  const { selectSpanById, spans, traceSignalsCount, openSignalInChat } = useTraceViewStore(
    (state) => ({
      selectSpanById: state.selectSpanById,
      spans: state.spans,
      traceSignalsCount: state.traceSignals.length,
      openSignalInChat: state.openSignalInChat,
    }),
    shallow
  );
  const hovered = usePanelHover();

  const events = (signal.events as EventRow[]) ?? [];
  const latestEvent = events[0];
  const isUnclustered = signal.clusterPath.length === 0;
  // "Open in Signals" only needs to appear in case 4 (multi-signal, this signal
  // unclustered). Cases 1-3 already expose it via the header ArrowUpRight /
  // ClusterLink. "Open in AI Chat" always appears in the hover toolbar.
  const showOpenInSignals = traceSignalsCount > 1 && isUnclustered;

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
    projectId: projectId as string,
    traceId,
    spans,
    onSelectSpan: selectSpanById,
  });

  return (
    <div className="px-4 pb-3 pt-2 flex flex-col gap-3">
      {/* Toolbar is hidden in the trigger (base) variant and revealed in the
          hover variant. We render the wrapper only when hovered so it doesn't
          take up gap space when collapsed; the hover popover's height: auto
          animation visually grows it into view, plus we fade in to soften the
          appearance after the popover has finished growing. */}
      {hovered && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18, delay: 0.15 }}
          className="flex items-center gap-1.5 flex-wrap"
        >
          <Button
            variant="outline"
            className="h-6 px-2 text-xs bg-transparent hover:bg-muted text-secondary-foreground border-blue-400/40"
            onClick={handleOpenInChat}
          >
            <Sparkles className="size-3.5 mr-1" />
            Open in AI Chat
          </Button>
          {showOpenInSignals && (
            <Button
              variant="outline"
              className="h-6 px-2 text-xs bg-transparent hover:bg-muted text-secondary-foreground border-blue-400/40"
              asChild
            >
              <Link href={`/project/${projectId}/signals/${signal.signalId}?traceId=${traceId}`} target="_blank">
                <ExternalLink className="size-3.5 mr-1" />
                Open in Signals
              </Link>
            </Button>
          )}
        </motion.div>
      )}
      {!latestEvent ? (
        <div className="py-2 text-xs text-muted-foreground">No events found</div>
      ) : (
        validFields.map((field) => (
          <div key={field.name} className="flex flex-col gap-1">
            <div className="text-xs text-muted-foreground">{field.name}</div>
            <div className="text-xs">
              <PayloadValue value={parsed[field.name]} field={field} spanRefCallbacks={spanRefCallbacks} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}
