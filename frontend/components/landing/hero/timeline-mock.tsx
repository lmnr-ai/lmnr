"use client";

import { motion, type Variants } from "framer-motion";
import { Bolt, Bot, CircleDollarSign, Clock3, Coins, MessageCircle } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { cn } from "@/lib/utils";

import SlackAlertMock from "./slack-alert-mock";

// Stagger fade-in mimicking spans streaming in from a live trace. Elements
// always stay mounted; only opacity animates so layout stays stable.
const FADE_DURATION = 0.25;
const BASE_STAGGER = 0.2;
const SUB_STAGGER = 0.08;
// Beat between the trace finishing and the signal-driven Slack alert arriving.
const ALERT_AFTER_TRACE = 0.2;

const FADE_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: (delay: number) => ({
    opacity: 1,
    transition: { delay, duration: FADE_DURATION, ease: "easeOut" },
  }),
};

// Cards pop in with a slight scale-up. `transformOrigin` is set inline based on
// whether the card hangs above or below its bar so it always grows out of the
// bar's edge instead of from its own centre.
const CARD_VARIANTS: Variants = {
  hidden: { opacity: 0, scale: 0.7 },
  visible: (delay: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay, duration: FADE_DURATION, ease: "easeOut" },
  }),
};

// Positions converted from the Figma frame (1256 px wide) into percentages so
// they stay aligned with the flex-based track at any container width.
const TIME_MARKERS = [
  { label: "0s", left: 1.9 },
  { label: "30s", left: 12.3 },
  { label: "1m", left: 23.4 },
  { label: "1m 30s", left: 34.1 },
  { label: "2m", left: 47.3 },
  { label: "2m 30s", left: 58.0 },
  { label: "3m", left: 71.5 },
  { label: "3m 30s", left: 82.3 },
  { label: "4m", left: 95.8 },
];

type SpanColor = "llm" | "tool" | "default" | "subagent";

// Match `SPAN_TYPE_TO_COLOR` from `lib/traces/utils.ts` so the mock reads as
// the real condensed timeline at a glance.
const BAR_BG: Record<SpanColor, string> = {
  llm: "bg-[hsl(var(--llm))]",
  tool: "bg-[rgba(227,160,8,0.9)]",
  default: "bg-[rgba(96,165,250,0.7)]",
  subagent: "bg-subagent/70",
};

const ICON_BG: Record<SpanColor, string> = BAR_BG;

const BAR_HEIGHT = 8;
const TRACK_TOP = 154;
const GROUP_ROW_GAP = 4;
const GROUP_ROW_HEIGHT = BAR_HEIGHT + GROUP_ROW_GAP;

const SUBAGENT_GROUP = {
  width: 234,
  rows: [
    [
      { left: 0, width: 76, color: "llm" as const },
      { left: 80, width: 23, color: "tool" as const },
      { left: 107, width: 76, color: "llm" as const },
      { left: 186, width: 48, color: "tool" as const },
    ],
    [
      { left: 0, width: 76, color: "llm" as const },
      { left: 80, width: 23, color: "tool" as const },
      { left: 107, width: 76, color: "llm" as const },
      { left: 186, width: 32, color: "tool" as const },
      { left: 222, width: 12, color: "llm" as const },
    ],
  ],
};

const CARD_GAP = 8;

type CardPosition = "above" | "below";

interface SpanCardProps {
  children: ReactNode;
  className?: string;
  // Square off the corner pointing at the bar so the card reads as "attached".
  position: CardPosition;
}

const SpanCard = ({ children, className, position }: SpanCardProps) => (
  <div
    className={cn(
      "rounded-md bg-landing-surface-600 border border-landing-surface-500 px-2.5 py-2 shadow-md shadow-black/40",
      position === "above" ? "rounded-bl-none" : "rounded-tl-none",
      className
    )}
  >
    {children}
  </div>
);

const StatsShield = ({ icon: Icon, label }: { icon: typeof Clock3; label: string }) => (
  <div className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
    <Icon className="size-3 min-w-3 min-h-3" />
    <span>{label}</span>
  </div>
);

const SpanIcon = ({ icon: Icon, color }: { icon: typeof Bolt; color: SpanColor }) => (
  <div
    className={cn("flex items-center justify-center rounded shrink-0 size-5", ICON_BG[color])}
    style={{ width: 20, height: 20 }}
  >
    <Icon className="text-white" size={14} />
  </div>
);

const CardRow = ({
  icon,
  color,
  title,
  shields,
}: {
  icon: typeof Bolt;
  color: SpanColor;
  title: string;
  shields?: { icon: typeof Clock3; label: string }[];
}) => (
  <div className="flex gap-2 items-center">
    <SpanIcon icon={icon} color={color} />
    <span className="font-medium text-[13px] text-foreground whitespace-nowrap">{title}</span>
    {shields && shields.length > 0 && (
      <div className="ml-auto flex items-center gap-2">
        {shields.map((s, i) => (
          <StatsShield key={i} icon={s.icon} label={s.label} />
        ))}
      </div>
    )}
  </div>
);

// Cards are render functions rather than JSX literals so the call site can pass
// in the bar-attachment side at render time.
type CardRender = (position: CardPosition) => ReactNode;

const BashCard: CardRender = (position) => (
  <SpanCard position={position} className="w-[240px]">
    <CardRow icon={Bolt} color="tool" title="Bash" shields={[{ icon: Clock3, label: "0.42s" }]} />
    <p className="mt-1 pl-7 text-[13px] text-secondary-foreground">git pull origin feat/dashboards</p>
  </SpanCard>
);

const LlmCard: CardRender = (position) => (
  <SpanCard position={position} className="w-[320px]">
    <CardRow
      icon={MessageCircle}
      color="llm"
      title="claude-opus-4-7"
      shields={[
        { icon: Clock3, label: "9.81s" },
        { icon: Coins, label: "18.4K" },
        { icon: CircleDollarSign, label: "0.27" },
      ]}
    />
    <p className="mt-1.5 pl-7 text-[13px] text-secondary-foreground leading-[18px]">
      I think I completed the task successfully. Now run tests to confirm nothing broke.
    </p>
  </SpanCard>
);

const ResearchAgentCard: CardRender = (position) => (
  <SpanCard position={position}>
    <CardRow
      icon={Bot}
      color="subagent"
      title="Research Agent"
      shields={[
        { icon: Clock3, label: "47.30s" },
        { icon: Coins, label: "42.1K" },
        { icon: CircleDollarSign, label: "0.31" },
      ]}
    />
    <div className="mt-2 flex gap-2">
      <span className="text-[13px] text-muted-foreground font-medium w-5 shrink-0">In</span>
      <p className="text-[13px] text-secondary-foreground leading-[18px]">
        Find libraries to help build our platform dashboards.
      </p>
    </div>
    <div className="my-2  border-t border-border" />
    <div className="flex gap-2">
      <span className="text-[13px] text-muted-foreground font-medium w-5 shrink-0">Out</span>
      <p className="text-[13px] text-secondary-foreground leading-[18px]">
        Top picks: Tremor, React Admin, Ant Design Pro — all have prebuilt dashboard primitives.
      </p>
    </div>
  </SpanCard>
);

// Top-level track items — bars + a slot reserved for the subagent group. The
// group slot's width must match SUBAGENT_GROUP.width so the parent purple
// bar lines up exactly with the rest of the row.
type TrackItem =
  | { kind: "bar"; width: number; color: SpanColor; card?: { render: CardRender; position: CardPosition } }
  | { kind: "group"; width: number };

const TRACK_ITEMS: TrackItem[] = [
  { kind: "bar", width: 28, color: "llm" },
  { kind: "bar", width: 12, color: "tool" },
  { kind: "bar", width: 77, color: "llm", card: { render: LlmCard, position: "above" } },
  { kind: "bar", width: 24, color: "tool" },
  { kind: "bar", width: 32, color: "llm" },
  { kind: "group", width: SUBAGENT_GROUP.width },
  { kind: "bar", width: 80, color: "llm" },
  { kind: "bar", width: 24, color: "tool", card: { render: BashCard, position: "above" } },
  { kind: "bar", width: 300, color: "llm" },
  { kind: "bar", width: 30, color: "tool" },
];

const CARD_WIDTH = 367;

interface BarDelays {
  bar: number;
  card?: number;
}

interface GroupDelays {
  // Root/parent purple bar — fades in first (same slot as a top-level bar)
  parent: number;
  // 2D array matching SUBAGENT_GROUP.rows shape; children stream in after the parent
  subBars: number[][];
  // Outline only — appears retroactively once all sub-bars are visible
  reveal: number;
  card: number;
}

// Compute deterministic delays in left-to-right order. Sub-bars stream inside
// the group first; the outline + parent bar reveal only after every sub-bar is
// already visible — so the grouping appears retroactively, like a real trace.
const computeDelays = (): { trackDelays: (BarDelays | GroupDelays)[]; total: number } => {
  const trackDelays: (BarDelays | GroupDelays)[] = [];
  let cursor = 0;
  for (const item of TRACK_ITEMS) {
    if (item.kind === "bar") {
      const barDelay = cursor;
      cursor += BASE_STAGGER;
      let cardDelay: number | undefined;
      if (item.card) {
        cardDelay = cursor;
        cursor += BASE_STAGGER * 0.7;
      }
      trackDelays.push({ bar: barDelay, card: cardDelay });
    } else {
      // Root span lands first — same cadence as a top-level bar.
      const parent = cursor;
      cursor += BASE_STAGGER;
      const subBars = SUBAGENT_GROUP.rows.map((row) =>
        row.map(() => {
          const d = cursor;
          cursor += SUB_STAGGER;
          return d;
        })
      );
      // Brief breath before the grouping outline appears retroactively.
      const reveal = cursor + 0.1;
      cursor = reveal + BASE_STAGGER;
      const card = cursor;
      cursor += BASE_STAGGER;
      trackDelays.push({ parent, subBars, reveal, card });
    }
  }
  return { trackDelays, total: cursor };
};

const TimelineBar = ({ bar, delays }: { bar: Extract<TrackItem, { kind: "bar" }>; delays: BarDelays }) => (
  <div className="relative" style={{ flexGrow: bar.width, flexShrink: 0, flexBasis: 0, height: BAR_HEIGHT }}>
    <motion.div
      variants={FADE_VARIANTS}
      custom={delays.bar}
      className={cn("absolute inset-0 rounded-xs", BAR_BG[bar.color])}
    />
    {bar.card && delays.card !== undefined && (
      <motion.div
        variants={CARD_VARIANTS}
        custom={delays.card}
        className="absolute left-0 z-10"
        style={{
          width: CARD_WIDTH,
          transformOrigin: bar.card.position === "above" ? "bottom left" : "top left",
          ...(bar.card.position === "above" ? { bottom: BAR_HEIGHT + CARD_GAP } : { top: BAR_HEIGHT + CARD_GAP }),
        }}
      >
        {bar.card.render(bar.card.position)}
      </motion.div>
    )}
  </div>
);

const SubagentGroupSlot = ({ groupHeight, delays }: { groupHeight: number; delays: GroupDelays }) => (
  <div className="relative" style={{ flexGrow: SUBAGENT_GROUP.width, flexShrink: 0, flexBasis: 0, height: BAR_HEIGHT }}>
    {/* Root/parent purple span — arrives first, like any top-level span */}
    <motion.div
      variants={FADE_VARIANTS}
      custom={delays.parent}
      className={cn("absolute inset-x-0 top-0 rounded-xs", BAR_BG.llm)}
      style={{ height: BAR_HEIGHT }}
    />
    {/* Outline — fades in AFTER all sub-bars exist, like the trace retroactively
        identifying these spans as a subagent group. Mirrors the expanded
        style of `subagent-group-element.tsx`. */}
    <motion.div
      variants={FADE_VARIANTS}
      custom={delays.reveal}
      className="absolute pointer-events-none rounded-xs outline outline-subagent/70 outline-offset-1 bg-subagent/40 z-10"
      style={{ left: 0, right: 0, top: 0, height: groupHeight }}
    />
    {/* Nested sub-rows — each sub-bar fades in left-to-right, row-by-row */}
    {SUBAGENT_GROUP.rows.map((row, ri) => (
      <div
        key={ri}
        className="absolute inset-x-0 flex gap-1"
        style={{ top: (ri + 1) * GROUP_ROW_HEIGHT, height: BAR_HEIGHT }}
      >
        {row.map((b, bi) => (
          <motion.div
            key={bi}
            variants={FADE_VARIANTS}
            custom={delays.subBars[ri][bi]}
            className={cn("rounded-xs", BAR_BG[b.color])}
            style={{ flexGrow: b.width, flexShrink: 0, flexBasis: 0 }}
          />
        ))}
      </div>
    ))}
    {/* Research Agent card hangs below the group, anchored to its left edge */}
    <motion.div
      variants={CARD_VARIANTS}
      custom={delays.card}
      className="absolute left-0 z-10"
      style={{ top: groupHeight + CARD_GAP, width: CARD_WIDTH, transformOrigin: "top left" }}
    >
      {ResearchAgentCard("below")}
    </motion.div>
  </div>
);

const TimelineMock = ({ className }: { className?: string }) => {
  // Group occupies one row for the parent bar + one row per nested sub-row, with
  // GROUP_ROW_GAP between rows. The outline sits flush with this content.
  const groupHeight = BAR_HEIGHT + SUBAGENT_GROUP.rows.length * GROUP_ROW_HEIGHT;
  const { trackDelays, total } = useMemo(() => computeDelays(), []);
  // Slack alert fires once the last span finishes, like a real signal.
  const alertDelay = total + ALERT_AFTER_TRACE;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      className="flex flex-row w-full bg-landing-surface-700/50 border border-landing-surface-500 rounded-md h-[389px]"
    >
      <div className={cn("relative w-full overflow-hidden", className)}>
        {/* Time-marker grid lines extending down through the timeline */}
        <div className="absolute inset-x-0 top-0 h-full">
          {TIME_MARKERS.map((m) => (
            <div key={m.label} className="absolute top-0 bottom-0" style={{ left: `${m.left}%` }}>
              <div className="absolute top-2 bottom-0 left-0 w-px bg-landing-surface-600" />
              <span className="relative pl-1.5 text-xs text-landing-surface-500 whitespace-nowrap">{m.label}</span>
            </div>
          ))}
        </div>

        {/* Main span-bar track — bars + the subagent group share one flex row.
          Each item is sized via flexGrow so widths scale with the container. */}
        <div className="absolute left-0 w-full flex gap-1 px-2" style={{ top: TRACK_TOP }}>
          {TRACK_ITEMS.map((item, i) =>
            item.kind === "bar" ? (
              <TimelineBar key={i} bar={item} delays={trackDelays[i] as BarDelays} />
            ) : (
              <SubagentGroupSlot key={i} groupHeight={groupHeight} delays={trackDelays[i] as GroupDelays} />
            )
          )}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-[120px] bg-gradient-to-l from-[#121212] to-transparent z-10" />
      </div>
      <div className="shrink-0 w-[260px] relative">
        <SlackAlertMock
          className="absolute -left-2 min-w-[300px] z-20"
          delay={alertDelay}
          top={TRACK_TOP + BAR_HEIGHT / 2}
        />
      </div>
    </motion.div>
  );
};

export default TimelineMock;
