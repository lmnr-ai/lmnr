import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { type Span, type TraceRow } from "@/lib/traces/types";

export interface SandboxPreviews {
  previews: Record<string, unknown>;
  inputPreviews: Record<string, unknown>;
  agentNames: Record<string, unknown>;
}

// One captured session: every response the session view needs, keyed by id.
export interface SandboxSessionFixture {
  sessionId: string;
  label: string;
  traces: TraceRow[];
  traceSpans: Record<string, TraceViewSpan[]>;
  previews: Record<string, SandboxPreviews>;
  outputs: Record<string, string | null>;
  spans: Record<string, Span>;
}
