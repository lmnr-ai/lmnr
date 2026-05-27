import { Bolt, MessageCircle, X } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

const SIGNAL_BORDER = "rgb(49 134 255 / 0.6)";
const SIGNAL_BG = "rgb(49 134 255 / 0.12)";

// Real spans inside trace 5a9d5634-a465-3f53-119e-359363ecd0d6.
// FLAG: these IDs are load-bearing — they're referenced by the auto-select
// + flash trigger in trace-bento.tsx. If the trace_id in
// `understand-why-trace-view/index.tsx` changes, re-derive these and the
// matching IDs in ask-ai.tsx from the new trace, or the chips will point
// at spans that don't exist in the rendered transcript.
export const SIGNAL_READ_SPAN_ID = "00000000-0000-0000-9531-48e702ed15da";
export const SIGNAL_EDIT_SPAN_ID = "00000000-0000-0000-4aee-680ebb392ebd";
export const SIGNAL_BASH_SPAN_ID = "00000000-0000-0000-d1df-1033750d3977";
// Most expensive single LLM call in the trace — 7.5s, $1.78. Same span
// referenced from the Ask AI answer.
export const SIGNAL_LLM_SPAN_ID = "00000000-0000-0000-405c-f341a1e0d0c1";

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
// Copy summarises the 5 real failure-points from trace
// 5a9d5634-a465-3f53-119e-359363ecd0d6 ("LAM-1590: Migrate clusters to
// rust"); the three chips link to real Read / Edit / Bash spans in that
// trace so clicking one drives the transcript scroll + selection.
export const SignalContent = ({ onSpanClick, flashSpanId }: SignalContentProps = {}) => {
  const chipProps = { onSpanClick, flashSpanId };
  return (
    <div className="w-full flex flex-col px-3 py-3 gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-white text-sm leading-none whitespace-nowrap">Agent run hit avoidable failures</span>
        <X className="size-4 shrink-0 text-landing-text-300" strokeWidth={1.5} />
      </div>

      <p className="text-landing-text-300 text-sm leading-6">
        Agent run flagged 4 issues. Hit{" "}
        <SpanChip
          iconBg="bg-tool"
          icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
          label="Read"
          spanId={SIGNAL_READ_SPAN_ID}
          onClick={chipProps.onSpanClick}
          flashSpanId={chipProps.flashSpanId}
        />{" "}
        EISDIR on a directory, attempted{" "}
        <SpanChip
          iconBg="bg-tool"
          icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
          label="Edit"
          spanId={SIGNAL_EDIT_SPAN_ID}
          onClick={chipProps.onSpanClick}
          flashSpanId={chipProps.flashSpanId}
        />{" "}
        before reading, a{" "}
        <SpanChip
          iconBg="bg-tool"
          icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
          label="Bash"
          spanId={SIGNAL_BASH_SPAN_ID}
          onClick={chipProps.onSpanClick}
          flashSpanId={chipProps.flashSpanId}
        />{" "}
        git checkout failed on a missing upstream, and one{" "}
        <SpanChip
          iconBg="bg-llm"
          icon={<MessageCircle className="size-3 text-white" strokeWidth={2} />}
          label="anthropic.messages"
          spanId={SIGNAL_LLM_SPAN_ID}
          onClick={chipProps.onSpanClick}
          flashSpanId={chipProps.flashSpanId}
        />{" "}
        burned $1.78.
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
