import { Bolt, Bot, CircleDollarSign, Clock3, Coins, MessageCircle } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

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
const TRACK_TOP = 144;
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

const CARD_GAP = 12;

interface SpanCardProps {
  children: ReactNode;
  className?: string;
}

const SpanCard = ({ children, className }: SpanCardProps) => (
  <div
    className={cn(
      "rounded-md bg-landing-surface-600 border border-landing-surface-500 p-2.5 shadow-md shadow-black/40",
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

const BashCard = () => (
  <SpanCard className="w-[240px]">
    <CardRow icon={Bolt} color="tool" title="Bash" shields={[{ icon: Clock3, label: "0.42s" }]} />
    <p className="mt-1 pl-7 text-[13px] text-secondary-foreground">git pull origin feat/dashboards</p>
  </SpanCard>
);

const LlmCard = () => (
  <SpanCard>
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

const ResearchAgentCard = () => (
  <SpanCard>
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
        Research libraries that can help build our platform dashboards.
      </p>
    </div>
    <div className="my-2  border-t border-border" />
    <div className="flex gap-2">
      <span className="text-[13px] text-muted-foreground font-medium w-5 shrink-0">Out</span>
      <p className="text-[13px] text-secondary-foreground leading-[18px]">
        Here are some libraries I found to help build platform dashboards: React admin, Ant design pro, ...more
      </p>
    </div>
  </SpanCard>
);

// Top-level track items — bars + a slot reserved for the subagent group. The
// group slot's width must match SUBAGENT_GROUP.width so the parent purple
// bar lines up exactly with the rest of the row.
type TrackItem =
  | { kind: "bar"; width: number; color: SpanColor; card?: { node: ReactNode; position: "above" | "below" } }
  | { kind: "group"; width: number };

const TRACK_ITEMS: TrackItem[] = [
  { kind: "bar", width: 128, color: "llm" },
  { kind: "bar", width: 58, color: "tool" },
  { kind: "bar", width: 62, color: "tool", card: { node: <BashCard />, position: "above" } },
  { kind: "bar", width: 171, color: "llm" },
  { kind: "group", width: SUBAGENT_GROUP.width },
  { kind: "bar", width: 62, color: "tool" },
  { kind: "bar", width: 77, color: "llm", card: { node: <LlmCard />, position: "above" } },
  { kind: "bar", width: 36, color: "tool" },
  { kind: "bar", width: 171, color: "llm" },
  { kind: "bar", width: 30, color: "tool" },
  { kind: "bar", width: 171, color: "llm" },
];

const CARD_WIDTH = 367;

const TimelineBar = ({ bar }: { bar: Extract<TrackItem, { kind: "bar" }> }) => (
  <div
    className={cn("relative rounded-xs", BAR_BG[bar.color])}
    style={{ flexGrow: bar.width, flexShrink: 0, flexBasis: 0, height: BAR_HEIGHT }}
  >
    {bar.card && (
      <div
        className="absolute left-0 z-10"
        style={{
          width: CARD_WIDTH,
          ...(bar.card.position === "above" ? { bottom: BAR_HEIGHT + CARD_GAP } : { top: BAR_HEIGHT + CARD_GAP }),
        }}
      >
        {bar.card.node}
      </div>
    )}
  </div>
);

const SubagentGroupSlot = ({ groupHeight }: { groupHeight: number }) => (
  <div className="relative" style={{ flexGrow: SUBAGENT_GROUP.width, flexShrink: 0, flexBasis: 0, height: BAR_HEIGHT }}>
    {/* Outline wraps the parent bar + 2 nested sub-rows. Mirrors the expanded
        style of `subagent-group-element.tsx`. */}
    <div
      className="absolute pointer-events-none rounded-xs outline outline-subagent/70 outline-offset-1 bg-subagent/40 z-10"
      style={{ left: 0, right: 0, top: 0, height: groupHeight }}
    />
    {/* Parent purple span — sits in the same row as the top track */}
    <div className={cn("absolute inset-x-0 top-0 rounded-xs", BAR_BG.llm)} style={{ height: BAR_HEIGHT }} />
    {/* Nested sub-rows */}
    {SUBAGENT_GROUP.rows.map((row, ri) => (
      <div
        key={ri}
        className="absolute inset-x-0 flex gap-1"
        style={{ top: (ri + 1) * GROUP_ROW_HEIGHT, height: BAR_HEIGHT }}
      >
        {row.map((b, bi) => (
          <div
            key={bi}
            className={cn("rounded-xs", BAR_BG[b.color])}
            style={{ flexGrow: b.width, flexShrink: 0, flexBasis: 0 }}
          />
        ))}
      </div>
    ))}
    {/* Research Agent card hangs below the group, anchored to its left edge */}
    <div className="absolute left-0 z-10" style={{ top: groupHeight + CARD_GAP, width: CARD_WIDTH }}>
      <ResearchAgentCard />
    </div>
  </div>
);

const TimelineMock = ({ className }: { className?: string }) => {
  // Group occupies one row for the parent bar + one row per nested sub-row, with
  // GROUP_ROW_GAP between rows. The outline sits flush with this content.
  const groupHeight = BAR_HEIGHT + SUBAGENT_GROUP.rows.length * GROUP_ROW_HEIGHT;

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-landing-surface-700/50 border border-landing-surface-500 rounded-md",
        className
      )}
      style={{ height: 389 }}
    >
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
      <div className="absolute left-0 right-0 flex gap-1 px-2" style={{ top: TRACK_TOP }}>
        {TRACK_ITEMS.map((item, i) =>
          item.kind === "bar" ? (
            <TimelineBar key={i} bar={item} />
          ) : (
            <SubagentGroupSlot key={i} groupHeight={groupHeight} />
          )
        )}
      </div>
    </div>
  );
};

export default TimelineMock;
