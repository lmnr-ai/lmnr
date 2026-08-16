import { Bolt, Boxes, MessageCircle, X } from "lucide-react";
import { type ReactNode } from "react";

import { withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import { SIGNAL_CLUSTER_COLOR, SIGNAL_CLUSTER_EVENT_COUNT, SIGNAL_CLUSTER_NAME } from "./signal-cluster";

// Literal values, not `var(--color-*)` — the landing trace panel animates the
// card open with framer, which can't tween CSS variable references.
export const SIGNAL_BORDER = "rgb(49 134 255 / 0.6)";
export const SIGNAL_BG = "rgb(49 134 255 / 0.12)";

/** The card's width wherever it is drawn standalone: inside the trace panel it
 *  is PANEL_W (400) less the header's `px-2` gutters, and the two animations
 *  that move it out of the panel (the signal stack, the collapse-to-pill morph)
 *  must use the SAME number or the card silently resizes mid-flight. */
export const SIGNAL_CARD_W = 384;

/** Header row height. A CONSTANT rather than the measured pill height, because
 *  it is the collapse target for the morph AND the row height of the static
 *  card — deriving it from a text measurement would make the two disagree for
 *  a frame while fonts settle. Must stay >= the pill's natural height, which is
 *  icon (20) + py-1.5 (12) + border (2). */
export const SIGNAL_HEADER_H = 34;

/** What the signal actually caught, as a headline. NOT the cluster name: a
 *  cluster only exists once enough events have grouped together, which is what
 *  the collapse-to-pill animation depicts. */
export const SIGNAL_EVENT_TITLE = "Agent run hit avoidable failures";

// Real spans inside trace f4a22e85-089a-0959-fd1e-3002e236e42f (opencode
// REST-client scaffold trace). Each chip points at the span that materialises
// the issue described in the surrounding prose.
//
// FLAG: these IDs are load-bearing — they're referenced by the step-5
// auto-select + flash in understand-why-trace-view. If COMPLEX_TRACE_ID in
// `understand-why-trace-view/steps.tsx` changes, re-derive these and the
// matching IDs in ask-ai.tsx from the new trace, or the chips will point
// at spans that don't exist in the rendered transcript.
//
// All four spans sit at top level under the `opencode turn` root — no
// subagent reveal required.
export const SIGNAL_PLAN_LLM_SPAN_ID = "00000000-0000-0000-5d0e-4970807b7819";
export const SIGNAL_PYTHON_NOT_FOUND_SPAN_ID = "00000000-0000-0000-038c-8b88bf836ac3";
export const SIGNAL_PARALLEL_CANCEL_SPAN_ID = "00000000-0000-0000-29df-c05ef26d7cd7";
export const SIGNAL_CWD_DRIFT_READ_SPAN_ID = "00000000-0000-0000-0cc6-1af923a75a8e";

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
    "inline-flex items-center gap-1 rounded border border-foreground-200/15 bg-foreground-200/15 pl-0.5 pr-1.5 py-0.5 align-middle transition-colors",
    onClick && "cursor-pointer hover:bg-foreground-200/25",
    isFlashing && "signal-span-flash"
  );
  const inner = (
    <>
      <span className={cn("inline-flex items-center justify-center size-4 rounded", iconBg)}>{icon}</span>
      <span className="text-foreground-200 text-xs leading-none">{label}</span>
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
  // Wired by the desktop trace-panel path. Selecting a span via the store
  // drives both the transcript scroll-to and the row's selected styling.
  onSpanClick?: (spanId: string) => void;
  // When matches one of the span IDs below, that chip pulses for ~1s to
  // grab the user's attention. Cleared by the trigger after the auto-select.
  flashSpanId?: string;
  // Wired by the desktop trace-panel path to close the signal panel.
  // Omitted on mobile — the X stays as a static icon.
  onClose?: () => void;
}

// The cluster this event was grouped into. Decorative — signals the row would
// be clickable in the real product.
//
// The icon is drawn here rather than via the production `ClusterIcon`, which
// pins itself inside a `size-4` box and takes no className: the pill is a
// standalone badge and wants a larger glyph than a dense list row does. Fill
// and stroke treatment are copied from it so the two still read as the same
// mark. Any size change here must be mirrored in SIGNAL_HEADER_H, which is the
// box the card collapses onto.
export const ClusterPill = () => (
  <div className="flex items-center gap-2 min-w-0 rounded-full border border-foreground-600 bg-white/5 px-2.5 py-1.5">
    <Boxes
      className="size-5 shrink-0"
      fill={withOpacity(SIGNAL_CLUSTER_COLOR, 0.1)}
      stroke={withOpacity(SIGNAL_CLUSTER_COLOR, 0.7)}
      strokeWidth={1}
    />
    <span className="text-white text-xs leading-none whitespace-nowrap">{SIGNAL_CLUSTER_NAME}</span>
    {/* Events in the cluster — the count of cards that collapsed into it. */}
    <span className="text-foreground-300 text-xs leading-none tabular-nums shrink-0">{SIGNAL_CLUSTER_EVENT_COUNT}</span>
  </div>
);

// Signal event card payload. Split out from SignalContent so the clusters
// animation can collapse it away independently of the pill above it.
//
// Copy summarises the 4 real failure-points from trace
// f4a22e85-089a-0959-fd1e-3002e236e42f (opencode REST-client scaffold). The
// first chip — ai.streamText.doStream — points at the top-level verify LLM
// where the agent *reasoned* itself into a PATH assumption; the other three
// chips are the downstream tool consequences. Clicking any chip drives the
// transcript scroll + selection.
export const SignalCardBody = ({ onSpanClick, flashSpanId }: Omit<SignalContentProps, "onClose"> = {}) => {
  const chipProps = { onSpanClick, flashSpanId };
  return (
    <p className="text-foreground-300 text-xs leading-5">
      Agent run flagged 4 issues. In one{" "}
      <SpanChip
        iconBg="bg-llm"
        icon={<MessageCircle className="size-3 text-white" strokeWidth={2} />}
        label="ai.streamText.doStream"
        spanId={SIGNAL_PLAN_LLM_SPAN_ID}
        onClick={chipProps.onSpanClick}
        flashSpanId={chipProps.flashSpanId}
      />{" "}
      the agent decided to run <code className="text-foreground-200">python</code> (macOS only ships{" "}
      <code className="text-foreground-200">python3</code>),{" "}
      <SpanChip
        iconBg="bg-tool"
        icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
        label="bash"
        spanId={SIGNAL_PYTHON_NOT_FOUND_SPAN_ID}
        onClick={chipProps.onSpanClick}
        flashSpanId={chipProps.flashSpanId}
      />{" "}
      then hit <code className="text-foreground-200">command not found</code> three times before recovering, a parallel{" "}
      <SpanChip
        iconBg="bg-tool"
        icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
        label="bash"
        spanId={SIGNAL_PARALLEL_CANCEL_SPAN_ID}
        onClick={chipProps.onSpanClick}
        flashSpanId={chipProps.flashSpanId}
      />{" "}
      pair cascade-cancelled, and{" "}
      <SpanChip
        iconBg="bg-tool"
        icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
        label="read"
        spanId={SIGNAL_CWD_DRIFT_READ_SPAN_ID}
        onClick={chipProps.onSpanClick}
        flashSpanId={chipProps.flashSpanId}
      />{" "}
      missed when the shell CWD drifted after a <code className="text-foreground-200">cd</code>.
    </p>
  );
};

// Signal event card inner content. No outer frame — callers wrap it (static
// border/bg here; the landing trace panel supplies its own animated wrapper).
export const SignalContent = ({ onSpanClick, flashSpanId, onClose }: SignalContentProps = {}) => (
  <div className="w-full flex flex-col px-3 py-2 gap-2">
    {/* Fixed row height so this card and the morphing one share a header box —
        the stack animation flies between them and any difference would read as
        the card resizing mid-flight. */}
    <div className="flex items-center justify-between gap-2" style={{ minHeight: SIGNAL_HEADER_H }}>
      <span className="text-sm font-medium text-white truncate">{SIGNAL_EVENT_TITLE}</span>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-foreground-300 hover:text-foreground-200 transition-colors"
          aria-label="Close signal panel"
        >
          <X className="size-4" strokeWidth={1.5} />
        </button>
      ) : (
        <X className="size-4 shrink-0 text-foreground-300" strokeWidth={1.5} />
      )}
    </div>

    <SignalCardBody onSpanClick={onSpanClick} flashSpanId={flashSpanId} />
  </div>
);

interface Props {
  className?: string;
}

// Static signal-event card (no morph). Used on mobile where each card is
// rendered standalone rather than animated open inside a trace panel.
const SignalEventCard = ({ className }: Props) => (
  <div
    style={{ borderColor: SIGNAL_BORDER, backgroundColor: SIGNAL_BG }}
    className={cn("rounded-md border overflow-hidden", className)}
  >
    <SignalContent />
  </div>
);

export default SignalEventCard;
