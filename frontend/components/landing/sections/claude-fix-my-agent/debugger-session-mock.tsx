"use client";

import {
  ArrowRight,
  Bolt,
  Braces,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coins,
  Copy,
  DatabaseZap,
  List,
  MessageCircle,
} from "lucide-react";
import { type ComponentType, type ReactNode, useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

// This file is a class-faithful "compile" of the real debugger trace tree
// (TraceItem + TraceCollapsedBody + InputItem + SpanItem + SpanStatsShield +
// SpanTypeIcon + CollapsedTextWithMore), driven by fake data from the scene.
// Match the prod classes verbatim when editing — the timeline is intentionally omitted.

// --- SpanTypeIcon: solid SPAN_TYPE_TO_COLOR square, 20px, w-4 h-4 glyph -------
export type SpanKind = "llm" | "tool" | "cached" | "default";

const SPAN_COLOR: Record<SpanKind, string> = {
  llm: "hsl(var(--llm))",
  cached: "hsl(var(--llm))",
  tool: "rgba(227, 160, 8, 0.9)",
  default: "rgba(96, 165, 250, 0.7)",
};

const SPAN_GLYPH: Record<SpanKind, ComponentType<{ size?: number; className?: string }>> = {
  llm: MessageCircle,
  cached: DatabaseZap,
  tool: Bolt,
  default: Braces,
};

const SpanIcon = ({ kind }: { kind: SpanKind }) => {
  const Glyph = SPAN_GLYPH[kind];
  return (
    <div
      className="flex items-center justify-center z-10 rounded shrink-0"
      style={{ backgroundColor: SPAN_COLOR[kind], minWidth: 20, minHeight: 20, width: 20, height: 20 }}
    >
      <Glyph className="w-4 h-4" size={14} />
    </div>
  );
};

// --- SpanStatsShield (variant="inline") --------------------------------------
const StatsShield = ({
  duration,
  inTokens,
  outTokens,
  cost,
}: {
  duration: string;
  inTokens?: string;
  outTokens?: string;
  cost?: string;
}) => {
  const hasTokens = !!inTokens || !!outTokens;
  return (
    <div className="items-center gap-2 text-xs flex shrink-0">
      <div className="text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
        <Clock3 size={12} className="min-w-3 min-h-3 size-3" />
        <span>{duration}</span>
      </div>
      {hasTokens && (
        <div className="text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
          <Coins size={12} className="min-w-3 min-h-3 size-3" />
          <span>{inTokens ?? "0"}</span>
          <ArrowRight size={12} />
          <span>{outTokens ?? "0"}</span>
        </div>
      )}
      {cost && (
        <div className="text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
          <CircleDollarSign size={12} className="min-w-3 min-h-3 size-3" />
          <span>{cost}</span>
        </div>
      )}
    </div>
  );
};

// --- CollapsedTextWithMore (static, non-overflowing) -------------------------
const Preview = ({ text }: { text: string }) => (
  <div
    className="text-[13px] text-secondary-foreground/95 whitespace-pre-wrap break-words"
    style={{ lineHeight: "21px" }}
  >
    <p className="line-clamp-4">{text}</p>
  </div>
);

// --- Inline note bits (exported so the scene/store can build note bodies) -----
export const SpanChip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/60 px-1 align-baseline text-[11px] text-foreground">
    {children}
  </span>
);

export const InlineCode = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1 py-px font-mono text-[0.85em] text-foreground">{children}</code>
);

// --- Run note (agent-authored) — deliberately smaller than the prod
// note-markdown scale so it reads as a caption above each run. -----------------
const Note = ({ heading, children }: { heading: string; children: ReactNode }) => (
  <div className="mb-2 px-1">
    <h2 className="mb-1 text-[13px] font-semibold text-foreground">{heading}</h2>
    <p className="text-xs leading-relaxed text-secondary-foreground">{children}</p>
  </div>
);

// --- InputItem ---------------------------------------------------------------
const InputItem = ({ text, className }: { text: string; className?: string }) => (
  <div className="flex">
    <div
      className={cn(
        "flex flex-col flex-1 min-w-0 py-2 pr-2 border-l-4 border-l-transparent gap-1 bg-blue-400/5 pl-1",
        className
      )}
    >
      <div className="flex gap-2 items-center min-w-0">
        <div className="flex items-center justify-center z-10 rounded shrink-0 bg-blue-400/70 w-5 h-5 min-w-5 min-h-5">
          <ArrowRight size={14} />
        </div>
        <span className="font-medium text-sm whitespace-nowrap shrink-0">Input</span>
      </div>
      <div className="pl-7">
        <Preview text={text} />
      </div>
    </div>
  </div>
);

export interface MockSpan {
  kind: SpanKind;
  name: string;
  model?: string;
  preview: string;
  duration: string;
  inTokens?: string;
  outTokens?: string;
  cost?: string;
}

// SpanItem: LLM/cached → name truncates, preview BELOW at pl-7. Tool/default →
// name + preview INLINE on the same row. Cached rows are dimmed.
const SpanItem = ({ span }: { span: MockSpan }) => {
  const isLLM = span.kind === "llm" || span.kind === "cached";
  const display = isLLM && span.model ? span.model : span.name;
  return (
    <div
      className={cn(
        "flex group/message cursor-pointer transition-all border-l-2 hover:bg-secondary border-l-transparent",
        span.kind === "cached" && "opacity-60"
      )}
    >
      <div className="flex flex-col flex-1 min-w-0 py-1.5 gap-1 pl-1.5 pr-2">
        <div className="flex gap-2 items-center min-w-0">
          <SpanIcon kind={span.kind} />
          {isLLM ? (
            <span className="font-medium text-[13px] whitespace-nowrap truncate">{display}</span>
          ) : (
            <div className="flex flex-1 gap-2 items-center min-w-0">
              <span className="font-medium text-[13px] whitespace-nowrap shrink-0">{display}</span>
              <span className="text-[13px] text-secondary-foreground truncate min-w-0">{span.preview}</span>
            </div>
          )}
          <div className="flex items-center shrink-0 ml-auto">
            <StatsShield
              duration={span.duration}
              inTokens={span.inTokens}
              outTokens={span.outTokens}
              cost={span.cost}
            />
          </div>
        </div>
        {isLLM && (
          <div className="pl-7">
            <Preview text={span.preview} />
          </div>
        )}
      </div>
    </div>
  );
};

// --- Expanded control strip (ViewToggle, transcript mode; no timeline btn) ----
const ControlStrip = () => (
  <div className="flex items-center justify-between gap-2">
    <div className="flex">
      <div className="flex items-center min-w-0">
        <button
          type="button"
          className="flex items-center h-6 px-1.5 text-xs border rounded-md focus-visible:outline-0"
        >
          <List size={14} className="mr-1" />
          <span className="capitalize">Transcript</span>
          <ChevronDown size={14} className="ml-1" />
        </button>
      </div>
    </div>
  </div>
);

// --- Trace card --------------------------------------------------------------
export interface MockTrace {
  duration: string;
  inTokens: string;
  outTokens: string;
  cost: string;
  relativeTime: string;
  inputPreview: string;
  spans: MockSpan[];
  note: { heading: string; body: ReactNode };
}

// The live, store-derived shape the session renders.
export interface VisibleTrace extends MockTrace {
  noteVisible: boolean;
  expanded: boolean;
}

const TraceCard = ({
  trace,
  index,
  total,
  onToggle,
}: {
  trace: VisibleTrace;
  index: number;
  total: number;
  onToggle: () => void;
}) => {
  const expanded = trace.expanded;
  const lastSpan = trace.spans[trace.spans.length - 1];
  return (
    <div className="transition-[padding] duration-200 ease-out group">
      <div className={cn("overflow-hidden w-full border border-x border-t", expanded ? "rounded-lg" : "rounded-t-lg")}>
        <div className="w-full flex flex-col transition-all ease-in-out">
          <button
            type="button"
            onClick={onToggle}
            className="w-full flex items-center justify-between text-left cursor-pointer transition-all ease-in-out h-[40px] pl-1.5 pr-3 bg-muted/75 hover:bg-muted/90"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center justify-center rounded-full border border-[rgba(232,232,232,0.1)] bg-[rgba(232,232,232,0.05)] px-2 py-0.5 text-[10px] font-medium leading-[17px] text-secondary-foreground whitespace-nowrap">
                {index}/{total}
              </span>
              <span className="text-[13px] font-medium leading-[17px] text-primary-foreground whitespace-nowrap">
                Trace
              </span>
              <span className="inline-flex items-center justify-center rounded hover:bg-secondary cursor-pointer">
                <ChevronDown className="size-3.5 text-secondary-foreground" />
              </span>
              <StatsShield
                duration={trace.duration}
                inTokens={trace.inTokens}
                outTokens={trace.outTokens}
                cost={trace.cost}
              />
            </div>
            <div className="flex items-center shrink-0">
              {expanded ? (
                <ChevronDown size={16} className="text-secondary-foreground" />
              ) : (
                <ChevronRight size={16} className="text-secondary-foreground" />
              )}
            </div>
          </button>
          {expanded && (
            <div className="px-3 py-2 bg-muted/50 border-t">
              <ControlStrip />
            </div>
          )}
        </div>
      </div>

      {/* Collapsed body: input + last span, stitched under the header. */}
      {!expanded && (
        <div className="flex flex-col overflow-hidden rounded-b-lg border-x border-b border-[rgba(232,232,232,0.1)] bg-muted/75">
          <div className="border-b border-[rgba(232,232,232,0.1)]">
            <InputItem text={trace.inputPreview} className="bg-transparent" />
          </div>
          <SpanItem span={lastSpan} />
        </div>
      )}

      {/* Expanded transcript: input + full span list (matches TraceSegment). */}
      {expanded && (
        <div className="mt-2 flex flex-col">
          <InputItem text={trace.inputPreview} className="rounded-lg" />
          {trace.spans.map((span, i) => (
            <SpanItem key={i} span={span} />
          ))}
        </div>
      )}
    </div>
  );
};

// --- Browser chrome ----------------------------------------------------------
const BrowserBar = () => (
  <div className="flex h-8 shrink-0 items-center gap-8 border-b border-surface-400 bg-surface-700 px-3">
    <div className="flex gap-1.5">
      <span className="size-2.5 rounded-full bg-surface-300" />
      <span className="size-2.5 rounded-full bg-surface-300" />
      <span className="size-2.5 rounded-full bg-surface-300" />
    </div>
    <span className="mx-auto flex-1 rounded-sm bg-surface-500 py-0.5 text-center text-[11px] font-medium text-foreground-500">
      Laminar / debugger-sessions
    </span>
    {/* balances the dots so the URL stays centred */}
    <div className="w-[42px]" />
  </div>
);

interface Props {
  // Store-derived view-model — the component is dumb and just renders this.
  name: string | null;
  traces: VisibleTrace[];
  revealKey: number;
  onToggle: (index: number) => void;
  className?: string;
}

// Mock of the Laminar debugger session inside a minimal browser window. Dumb: it
// reflects whatever the scene/store hands it. Autoscrolls to the bottom whenever
// new content streams in (revealKey bump).
const DebuggerSessionMock = ({ name, traces, revealKey, onToggle, className }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stick-to-bottom as runs/notes/spans stream in — mirrors the real session
  // view. Keyed on scene growth only, so a manual expand doesn't yank the scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [revealKey]);

  return (
    <div
      className={cn(
        "flex h-[480px] w-[400px] shrink-0 flex-col overflow-hidden rounded-md border border-surface-400 bg-surface-800",
        className
      )}
    >
      <BrowserBar />
      <div ref={scrollRef} className="thin-scrollbar flex-1 overflow-y-auto scroll-smooth">
        <div className="flex flex-col px-4 pb-10">
          {/* Session header — name is muted until the session is named. */}
          <header className="mb-3 mt-4 flex flex-col gap-1.5">
            {name ? (
              <h1 className="text-sm font-medium text-foreground">{name}</h1>
            ) : (
              <h1 className="text-sm font-medium text-muted-foreground">Set session name</h1>
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-secondary-foreground">
              <span>Created 4m ago</span>
              <span>·</span>
              <span>Updated just now</span>
              <span>·</span>
              <span>
                {traces.length} {traces.length === 1 ? "trace" : "traces"}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                Copy ID
                <Copy className="size-2.5" />
              </span>
            </div>
          </header>

          {traces.length === 0 ? (
            <div className="flex justify-center py-10 text-[11px] text-muted-foreground">
              No runs in this session yet
            </div>
          ) : (
            traces.map((trace, i) => (
              <div key={i} className={cn(i > 0 && "mt-5")}>
                {trace.noteVisible && <Note heading={trace.note.heading}>{trace.note.body}</Note>}
                {/* zoom keeps the prod trace-card classes verbatim but scales the
                    whole card down to fit the narrow landing column. */}
                <div style={{ zoom: 0.85 }}>
                  <TraceCard trace={trace} index={i + 1} total={traces.length} onToggle={() => onToggle(i)} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DebuggerSessionMock;
