import { Bolt, MessageCircle, X } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

const SIGNAL_BORDER = "rgb(49 134 255 / 0.6)";
const SIGNAL_BG = "rgb(49 134 255 / 0.12)";

// Real spans inside trace 91c04f82-3121-3807-0e88-855cb5564715 (REST-client
// scaffold trace). Each chip points at the span that materialises the issue
// described in the surrounding prose.
//
// FLAG: these IDs are load-bearing — they're referenced by the auto-select
// + flash trigger in trace-bento.tsx. If the trace_id in
// `understand-why-trace-view/index.tsx` changes, re-derive these and the
// matching IDs in ask-ai.tsx from the new trace, or the chips will point
// at spans that don't exist in the rendered transcript.
//
// NOTE: two of these spans live INSIDE the pagination subagent (Agent group
// 946c…) — `SIGNAL_PLAN_LLM_SPAN_ID` and `SIGNAL_PYTHON_NOT_FOUND_SPAN_ID`.
// Clicking them must route through `selectAndRevealSpan` in trace-bento so
// the transcript expands the subagent group before scrolling. The other two
// chips sit at top level under the query span.
export const SIGNAL_PLAN_LLM_SPAN_ID = "00000000-0000-0000-9eec-e8b846a419d0";
export const SIGNAL_PYTHON_NOT_FOUND_SPAN_ID = "00000000-0000-0000-caf3-ba12dc2a1a43";
export const SIGNAL_PARALLEL_CANCEL_SPAN_ID = "00000000-0000-0000-54b7-654ddf0fabb8";
export const SIGNAL_CWD_DRIFT_READ_SPAN_ID = "00000000-0000-0000-9e5b-c6c4c619bda0";

interface SpanChipProps {
  iconBg: string;
  icon: ReactNode;
  label: string;
  spanId?: string;
  flashSpanId?: string;
  onClick?: (spanId: string) => void;
}

// Renders inline inside the payload paragraph. Chip is a <button> when an
// `onClick` is wired in, otherwise renders as a static <span> (mobile path
// has no trace-view store to wire selection into). Flash class is a small
// pulse keyed on `flashSpanId === spanId` and consumed by globals.css's
// `signal-span-flash` keyframe.
const SpanChip = ({ iconBg, icon, label, spanId, flashSpanId, onClick }: SpanChipProps) => {
  const isFlashing = !!spanId && flashSpanId === spanId;
  const className = cn(
    "inline-flex items-center gap-1 rounded border border-landing-text-200/15 bg-landing-text-200/15 pl-0.5 pr-1.5 py-0.5 align-middle transition-colors",
    onClick && "cursor-pointer hover:bg-landing-text-200/25",
    isFlashing && "signal-span-flash"
  );
  const inner = (
    <>
      <span className={cn("inline-flex items-center justify-center size-4 rounded", iconBg)}>{icon}</span>
      <span className="text-landing-text-200 text-xs leading-none">{label}</span>
    </>
  );
  if (onClick && spanId) {
    return (
      <button type="button" onClick={() => onClick(spanId)} className={className}>
        {inner}
      </button>
    );
  }
  return <span className={className}>{inner}</span>;
};

interface SignalContentProps {
  // Wired by the desktop trace-bento path. Selecting a span via the store
  // drives both the transcript scroll-to and the row's selected styling.
  onSpanClick?: (spanId: string) => void;
  // When matches one of the span IDs below, that chip pulses for ~1s to
  // grab the user's attention. Cleared by the trigger after the auto-select.
  flashSpanId?: string;
}

// Signal event card inner content. No outer frame — callers wrap it (static
// border/bg here, animated wrapper in slack-to-signal-morph).
// Copy summarises the 4 real failure-points from trace
// 91c04f82-3121-3807-0e88-855cb5564715 (REST-client scaffold). The first
// chip — anthropic.messages — points at the planning span where the agent
// *reasoned* itself into a PATH assumption; the other three chips are the
// downstream tool consequences. Clicking any chip drives the transcript
// scroll + selection (subagent groups expand automatically via
// selectAndRevealSpan in trace-bento).
export const SignalContent = ({ onSpanClick, flashSpanId }: SignalContentProps = {}) => {
  const chipProps = { onSpanClick, flashSpanId };
  return (
    <div className="w-full flex flex-col px-3 py-3 gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-white text-xs leading-none whitespace-nowrap">Agent run hit avoidable failures</span>
        <X className="size-4 shrink-0 text-landing-text-300" strokeWidth={1.5} />
      </div>

      <p className="text-landing-text-300 text-xs leading-5">
        Agent run flagged 4 issues. In one{" "}
        <SpanChip
          iconBg="bg-llm"
          icon={<MessageCircle className="size-3 text-white" strokeWidth={2} />}
          label="anthropic.messages"
          spanId={SIGNAL_PLAN_LLM_SPAN_ID}
          onClick={chipProps.onSpanClick}
          flashSpanId={chipProps.flashSpanId}
        />{" "}
        the agent decided to run <code className="text-landing-text-200">python</code> (macOS only ships{" "}
        <code className="text-landing-text-200">python3</code>),{" "}
        <SpanChip
          iconBg="bg-tool"
          icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
          label="Bash"
          spanId={SIGNAL_PYTHON_NOT_FOUND_SPAN_ID}
          onClick={chipProps.onSpanClick}
          flashSpanId={chipProps.flashSpanId}
        />{" "}
        then hit <code className="text-landing-text-200">command not found</code> three times before recovering, a
        parallel{" "}
        <SpanChip
          iconBg="bg-tool"
          icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
          label="Bash"
          spanId={SIGNAL_PARALLEL_CANCEL_SPAN_ID}
          onClick={chipProps.onSpanClick}
          flashSpanId={chipProps.flashSpanId}
        />{" "}
        pair cascade-cancelled, and{" "}
        <SpanChip
          iconBg="bg-tool"
          icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
          label="Read"
          spanId={SIGNAL_CWD_DRIFT_READ_SPAN_ID}
          onClick={chipProps.onSpanClick}
          flashSpanId={chipProps.flashSpanId}
        />{" "}
        missed when the shell CWD drifted after a <code className="text-landing-text-200">cd</code>.
      </p>
    </div>
  );
};

interface Props {
  className?: string;
}

// Static signal-event card (no morph). Used on mobile where each card is
// rendered standalone instead of cross-fading via the morph wrapper.
const SignalEventCard = ({ className }: Props) => (
  <div
    style={{ borderColor: SIGNAL_BORDER, backgroundColor: SIGNAL_BG }}
    className={cn("rounded-md border overflow-hidden", className)}
  >
    <SignalContent />
  </div>
);

export default SignalEventCard;
