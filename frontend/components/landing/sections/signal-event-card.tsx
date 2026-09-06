import { Bolt, Boxes, MessageCircle, X } from "lucide-react";
import { type ReactNode } from "react";

import { withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import { DEMO_ANSWER_SPAN_ID, DEMO_FAILED_FETCH_SPAN_ID, DEMO_LAST_SEARCH_SPAN_ID } from "./demo-trace";
import { SIGNAL_CLUSTER_COLOR, SIGNAL_CLUSTER_EVENT_COUNT, SIGNAL_CLUSTER_NAME } from "./signal-cluster";

// Literal values, not `var(--color-*)` — the landing trace panel animates the
// card open with framer, which can't tween CSS variable references.
export const SIGNAL_BORDER = "rgb(49 134 255 / 0.6)";
export const SIGNAL_BG = "rgb(49 134 255 / 0.12)";

/** The card's width at the base breakpoint: the trace panel's 400 less the
 *  header's `px-2` gutters. The panel widens at 2xl, so the desktop stack
 *  MEASURES the live card instead and this is only its seed — the two must agree
 *  or the card resizes at the frame the flight hands over. */
export const SIGNAL_CARD_W = 384;

/** The cluster pill's box height, and the morph's collapse target. A CONSTANT,
 *  not the measured pill, which would disagree for a frame while fonts settle:
 *  icon (20) + py-1.5 (12) + border (2). NOT a header row height — it used to
 *  double as one and left ~9px of dead air around every card title. */
export const SIGNAL_HEADER_H = 34;

/** The SIGNAL's name, as the card's headline. NOT the cluster name: a cluster
 *  only exists once enough events have grouped together, which is what the
 *  collapse-to-pill animation depicts. */
export const SIGNAL_EVENT_TITLE = "Failure detector";

/** What this particular event caught, as a sentence. Split from the title
 *  because ./slack-notification-card opens its message body with it, where a
 *  signal's NAME would read as a fragment. */
export const SIGNAL_EVENT_SUMMARY = "Answered without citing a source";

interface SpanChipProps {
  iconBg: string;
  icon: ReactNode;
  label: string;
  spanId?: string;
  onClick?: (spanId: string) => void;
}

// Renders inline inside the payload paragraph. Chip is a <button> when an
// `onClick` is wired in, otherwise renders as a static <span> (mobile path
// has no trace-view store to wire selection into).
const SpanChip = ({ iconBg, icon, label, spanId, onClick }: SpanChipProps) => {
  const className = cn(
    "inline-flex items-center gap-1 rounded border border-foreground-200/15 bg-foreground-200/15 pl-0.5 pr-1.5 py-0.5 align-middle transition-colors",
    onClick && "cursor-pointer hover:bg-foreground-200/25"
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
  // Wired by the desktop trace-panel path to close the signal panel.
  // Omitted on mobile — the X stays as a static icon.
  onClose?: () => void;
}

// The cluster this event was grouped into. Its icon is drawn here rather than
// via the production `ClusterIcon`, which pins itself in a `size-4` box: a
// standalone badge wants a bigger glyph than a dense list row. Any size change
// must be mirrored in SIGNAL_HEADER_H, the box the card collapses onto.
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

// The card's payload, split out of SignalContent so the clusters animation can
// collapse it away independently of the pill. Each chip points at the span that
// materialises its claim, and clicking one scrolls the transcript to it.
export const SignalCardBody = ({ onSpanClick }: Omit<SignalContentProps, "onClose"> = {}) => (
  <p className="text-foreground-300 text-xs leading-5">
    The agent ran{" "}
    <SpanChip
      iconBg="bg-tool"
      icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
      label="web_search"
      spanId={DEMO_LAST_SEARCH_SPAN_ID}
      onClick={onSpanClick}
    />{" "}
    three times for the same question, carried on past a <code className="text-foreground-200">404</code> from{" "}
    <SpanChip
      iconBg="bg-tool"
      icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
      label="fetch_page"
      spanId={DEMO_FAILED_FETCH_SPAN_ID}
      onClick={onSpanClick}
    />{" "}
    without retrying, then{" "}
    <SpanChip
      iconBg="bg-llm"
      icon={<MessageCircle className="size-3 text-white" strokeWidth={2} />}
      label="ai.llm"
      spanId={DEMO_ANSWER_SPAN_ID}
      onClick={onSpanClick}
    />{" "}
    answered from a snippet without linking the page it read.
  </p>
);

// Signal event card inner content. No outer frame — callers wrap it (static
// border/bg here; the landing trace panel supplies its own animated wrapper).
export const SignalContent = ({ onSpanClick, onClose }: SignalContentProps = {}) => (
  <div className="w-full flex flex-col px-3 py-2 gap-0.5">
    {/* Natural height. It used to be pinned to SIGNAL_HEADER_H so this card and
        the morphing one shared a header box, but that constant is the PILL's
        height — 34px around a 12px title, which is ~9px of dead air above and
        below it. The morph now centres its pill on the card instead, so both
        header rows can just be as tall as their content. */}
    <div className="flex items-center justify-between gap-2">
      {/* Same size as the body below it — weight and colour already carry the
          hierarchy, so a larger title only adds a gap under the header. */}
      <span className="text-xs font-medium text-white truncate">{SIGNAL_EVENT_TITLE}</span>
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

    <SignalCardBody onSpanClick={onSpanClick} />
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
