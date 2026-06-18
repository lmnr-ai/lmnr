"use client";

import { ArrowRight, Bolt, Braces, ChevronDown, Clock3, Coins, Copy, DatabaseZap, MessageCircle } from "lucide-react";
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

// --- Span icon (mirrors SpanTypeIcon: a SOLID colour square + foreground glyph,
// using the real SPAN_TYPE_TO_COLOR values) ---------------------------------
type SpanKind = "llm" | "tool" | "cached" | "default";

const SPAN_COLOR: Record<SpanKind, string> = {
  llm: "hsl(var(--llm))",
  cached: "hsl(var(--llm))",
  tool: "rgba(227, 160, 8, 0.9)",
  default: "rgba(96, 165, 250, 0.7)",
};

const SPAN_GLYPH: Record<SpanKind, ComponentType<{ size?: number }>> = {
  llm: MessageCircle,
  cached: DatabaseZap,
  tool: Bolt,
  default: Braces,
};

const SpanIcon = ({ kind }: { kind: SpanKind }) => {
  const Glyph = SPAN_GLYPH[kind];
  return (
    <div
      className="flex size-4 min-h-4 min-w-4 shrink-0 items-center justify-center rounded"
      style={{ backgroundColor: SPAN_COLOR[kind] }}
    >
      <Glyph size={11} />
    </div>
  );
};

// --- Run note (agent-authored), mirrors note-markdown.tsx prose, scaled down --
const Note = ({ heading, children }: { heading: string; children: ReactNode }) => (
  <div className="px-1 pb-4 pt-1">
    <h2 className="mb-0.5 mt-2 text-[13px] font-semibold text-foreground">{heading}</h2>
    <p className="my-1 text-xs leading-relaxed text-secondary-foreground">{children}</p>
  </div>
);

const SpanChip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/60 px-1 align-baseline text-[11px] text-foreground">
    {children}
  </span>
);

const InlineCode = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1 py-px font-mono text-[0.85em] text-foreground">{children}</code>
);

// --- Rows --------------------------------------------------------------------
const InputRow = ({ text }: { text: string }) => (
  <div className="flex border-l-2 border-l-transparent bg-blue-400/5 py-1.5 pl-1 pr-2">
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className="flex size-4 min-h-4 min-w-4 items-center justify-center rounded bg-blue-400/70">
          <ArrowRight size={11} />
        </div>
        <span className="shrink-0 whitespace-nowrap text-[11px] font-medium">Input</span>
      </div>
      <p className="truncate pl-6 text-[11px] text-secondary-foreground">{text}</p>
    </div>
  </div>
);

interface MockSpan {
  kind: SpanKind;
  name: string;
  preview: string;
  duration: string;
}

const SpanRow = ({ span }: { span: MockSpan }) => (
  <div
    className={cn(
      "flex cursor-pointer border-l-2 border-l-transparent transition-colors hover:bg-secondary",
      span.kind === "cached" && "opacity-60"
    )}
  >
    <div className="flex min-w-0 flex-1 flex-col gap-1 py-1.5 pl-1.5 pr-2">
      <div className="flex items-center gap-2">
        <SpanIcon kind={span.kind} />
        <span className="truncate text-[11px] font-medium">{span.name}</span>
        <div className="ml-auto inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
          <Clock3 className="size-2.5" />
          <span>{span.duration}</span>
        </div>
      </div>
      <p className="truncate pl-6 text-[11px] text-secondary-foreground">{span.preview}</p>
    </div>
  </div>
);

// --- Trace card --------------------------------------------------------------
interface MockTrace {
  duration: string;
  inTokens: string;
  outTokens: string;
  cost: string;
  relativeTime: string;
  inputPreview: string;
  spans: MockSpan[];
  note: { heading: string; body: ReactNode };
}

const StatItem = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
  <div className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground">
    {icon}
    <span>{children}</span>
  </div>
);

const TraceCard = ({
  trace,
  index,
  total,
  expanded,
  onToggle,
}: {
  trace: MockTrace;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const lastSpan = trace.spans[trace.spans.length - 1];
  return (
    <div className="group">
      {/* Header — top-rounded, no bottom rounding; the body stitches it shut. */}
      <div className="w-full overflow-hidden rounded-t-lg border border-x border-t">
        <button
          type="button"
          onClick={onToggle}
          className="flex h-9 w-full items-center justify-between bg-muted/75 pl-1.5 pr-3 transition-colors hover:bg-muted/90"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-[rgba(232,232,232,0.1)] bg-[rgba(232,232,232,0.05)] px-1.5 py-0.5 text-[9px] font-medium leading-none text-secondary-foreground">
              {index}/{total}
            </span>
            <span className="whitespace-nowrap text-[11px] font-medium leading-none text-primary-foreground">
              Trace
            </span>
            <div className="flex shrink-0 items-center gap-2 text-[10px]">
              <StatItem icon={<Clock3 className="size-2.5" />}>{trace.duration}</StatItem>
              <StatItem icon={<Coins className="size-2.5" />}>
                {trace.inTokens}
                <ArrowRight size={10} className="mx-0.5 inline" />
                {trace.outTokens}
              </StatItem>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-[10px] leading-none text-secondary-foreground">
              {trace.relativeTime}
            </span>
            <ChevronDown
              className={cn("size-3.5 text-secondary-foreground transition-transform", !expanded && "-rotate-90")}
            />
          </div>
        </button>
      </div>

      {/* Body — collapsed: input + last span; expanded: input + full transcript. */}
      <div className="flex flex-col overflow-hidden rounded-b-lg border-x border-b border-[rgba(232,232,232,0.1)] bg-muted/40">
        <div className="border-b border-[rgba(232,232,232,0.1)]">
          <InputRow text={trace.inputPreview} />
        </div>
        {expanded ? trace.spans.map((span, i) => <SpanRow key={i} span={span} />) : <SpanRow span={lastSpan} />}
      </div>
    </div>
  );
};

// --- Mock data (2 agent runs = 2 traces, mapped to the terminal's runs) -------
const TRACES: MockTrace[] = [
  {
    duration: "6.2s",
    inTokens: "12.4K",
    outTokens: "842",
    cost: "$0.0391",
    relativeTime: "4m ago",
    inputPreview: "Read the repo and update MEMORY.md with anything you learned.",
    spans: [
      {
        kind: "llm",
        name: "anthropic.messages",
        preview: "I'll read the repository structure first.",
        duration: "1.1s",
      },
      { kind: "tool", name: "read_file", preview: "README.md · 2.1 KB", duration: "0.1s" },
      { kind: "llm", name: "anthropic.messages", preview: "Here's a summary of what the repo does.", duration: "2.4s" },
    ],
    note: {
      heading: "Reproduced the issue",
      body: (
        <>
          The run finished without ever writing to <InlineCode>MEMORY.md</InlineCode>. The save step is skipped after
          the <SpanChip>final response</SpanChip>.
        </>
      ),
    },
  },
  {
    duration: "7.5s",
    inTokens: "13.0K",
    outTokens: "1.1K",
    cost: "$0.0431",
    relativeTime: "just now",
    inputPreview: "Read the repo and update MEMORY.md with anything you learned.",
    spans: [
      {
        kind: "cached",
        name: "anthropic.messages",
        preview: "Reading the repo, then I'll record findings.",
        duration: "0.0s",
      },
      { kind: "tool", name: "read_file", preview: "README.md · 2.1 KB", duration: "0.1s" },
      { kind: "llm", name: "anthropic.messages", preview: "Writing what I learned to MEMORY.md.", duration: "1.8s" },
      { kind: "tool", name: "write_file", preview: 'path="MEMORY.md" · 312 bytes', duration: "0.1s" },
    ],
    note: {
      heading: "Fix confirmed",
      body: (
        <>
          <InlineCode>MEMORY.md</InlineCode> now contains the new entry — the agent calls{" "}
          <SpanChip>write_file</SpanChip> before exit. Verified with a SQL query over the latest run.
        </>
      ),
    },
  },
];

const TOTAL = TRACES.length;

// --- Browser chrome ----------------------------------------------------------
const BrowserBar = () => (
  <div className="flex h-8 shrink-0 items-center border-b border-surface-400 bg-surface-700 px-3">
    <div className="flex gap-1.5">
      <span className="size-2.5 rounded-full bg-surface-300" />
      <span className="size-2.5 rounded-full bg-surface-300" />
      <span className="size-2.5 rounded-full bg-surface-300" />
    </div>
    <span className="mx-auto text-[11px] font-medium text-foreground-500">Laminar · Debugger</span>
    {/* balances the dots so the title stays centred */}
    <div className="w-[42px]" />
  </div>
);

interface Props {
  traces: number;
  notes: number[];
  expand: number[];
  revealKey: number;
  className?: string;
}

// Mock of the Laminar debugger session, inside a minimal browser window. Driven
// by the parent scene: `traces` runs have streamed in, `notes` are the trace
// indices whose agent note is written, `expand` the indices auto-expanded.
// Autoscrolls to the bottom whenever new content streams in (revealKey bump).
const DebuggerSessionMock = ({ traces, notes, expand, revealKey, className }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  // User clicks override the scene-driven expansion; effective state is derived
  // (no setState-in-effect), so a card the scene auto-expands can still be collapsed.
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const isExpanded = (i: number) => (i in overrides ? overrides[i] : expand.includes(i));

  // Stick-to-bottom as runs/notes/spans stream in — mirrors the real session
  // view. Keyed on scene growth only, so a manual expand doesn't yank the scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [revealKey]);

  const toggle = (i: number) => setOverrides((prev) => ({ ...prev, [i]: !isExpanded(i) }));

  return (
    <div
      className={cn(
        "flex h-[480px] w-full flex-col overflow-hidden rounded-md border border-surface-400 bg-surface-800",
        className
      )}
    >
      <BrowserBar />
      <div ref={scrollRef} className="thin-scrollbar flex-1 overflow-y-auto scroll-smooth">
        <div className="flex flex-col px-4 pb-10">
          {/* Session header */}
          <header className="flex flex-col gap-1.5 pb-2 pt-4">
            <h1 className="text-sm font-medium text-foreground">Fix: MEMORY.md never written</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-secondary-foreground">
              <span>Created 4m ago</span>
              <span>·</span>
              <span>Updated just now</span>
              <span>·</span>
              <span>{TOTAL} traces</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                Copy ID
                <Copy className="size-2.5" />
              </span>
            </div>
          </header>

          {traces === 0 ? (
            <div className="flex justify-center py-10 text-[11px] text-muted-foreground">
              No runs in this session yet
            </div>
          ) : (
            TRACES.slice(0, traces).map((trace, i) => (
              <div key={i}>
                {notes.includes(i) && <Note heading={trace.note.heading}>{trace.note.body}</Note>}
                <TraceCard
                  trace={trace}
                  index={i + 1}
                  total={TOTAL}
                  expanded={isExpanded(i)}
                  onToggle={() => toggle(i)}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DebuggerSessionMock;
