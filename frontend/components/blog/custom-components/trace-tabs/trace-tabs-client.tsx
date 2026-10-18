"use client";

import { ArrowUpRight } from "lucide-react";
import { type ReactNode, useState } from "react";

import { type TraceViewSpan, type TraceViewTrace } from "@/components/traces/trace-view/store";

import TabBar from "../tab-bar";
import EmbeddedTraceView from "./embedded-trace-view";
import TraceEmbedBoundary from "./trace-embed-boundary";

const CLOUD_SHARED_PAGE = "https://laminar.sh/shared/traces";

export interface TraceTabData {
  label: string;
  traceId: string;
  description?: ReactNode;
  trace: TraceViewTrace | null;
  spans: TraceViewSpan[];
}

// Shown when the trace isn't public or couldn't be loaded/rendered. Mirrors the
// embed height so the layout doesn't jump, and always offers the link out.
function EmbedFallback({ traceId, message }: { traceId: string; message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-secondary-foreground">
      <span>{message}</span>
      <a
        href={`${CLOUD_SHARED_PAGE}/${traceId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-white hover:underline"
      >
        Open full trace <ArrowUpRight className="size-3" />
      </a>
    </div>
  );
}

export default function TraceTabsClient({ tabs }: { tabs: TraceTabData[] }) {
  const [active, setActive] = useState(0);
  const tab = tabs[active];
  if (!tab) return null;

  return (
    <div className="not-typeset my-8 flex flex-col gap-3">
      <TabBar items={tabs} active={active} onSelect={setActive} />
      {tab.description && (
        <div className="text-sm leading-relaxed text-secondary-foreground [&_p]:m-0">{tab.description}</div>
      )}
      <div className="h-[560px] overflow-hidden rounded-lg border border-white/10 bg-background">
        {tab.trace ? (
          // Keyed by trace id so a caught error on one tab resets when switching.
          <TraceEmbedBoundary
            key={tab.traceId}
            fallback={<EmbedFallback traceId={tab.traceId} message="Couldn't load this trace here." />}
          >
            <EmbeddedTraceView key={tab.traceId} trace={tab.trace} spans={tab.spans} />
          </TraceEmbedBoundary>
        ) : (
          <EmbedFallback traceId={tab.traceId} message="This trace isn't public yet." />
        )}
      </div>
      {tab.trace && (
        <a
          href={`${CLOUD_SHARED_PAGE}/${tab.traceId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 self-end text-xs text-secondary-foreground hover:text-white"
        >
          Open full trace <ArrowUpRight className="size-3" />
        </a>
      )}
    </div>
  );
}
