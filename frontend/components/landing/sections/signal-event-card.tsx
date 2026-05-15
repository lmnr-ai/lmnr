import { ArrowUpRight, Bolt, Box, MessageCircle, Sparkles, X } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

const ACCENT = "rgb(49 134 255)";
const SIGNAL_BORDER = "rgb(49 134 255 / 0.6)";
const SIGNAL_BG = "rgb(49 134 255 / 0.12)";

const withOpacity = (color: string, opacity: number) =>
  `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;

const CLUSTER_PATH = [
  { color: "var(--color-blue-500)" },
  { color: "var(--color-indigo-500)" },
  { color: "var(--color-purple-500)" },
];

const ACTION_BUTTONS = [
  { Icon: Sparkles, label: "Open in AI Chat" },
  { Icon: ArrowUpRight, label: "Open in Signals" },
];

const ClusterCube = ({ color }: { color: string }) => (
  <Box className="size-3 shrink-0" fill={withOpacity(color, 0.15)} stroke={withOpacity(color, 0.8)} strokeWidth={1.5} />
);

const SpanChip = ({ iconBg, icon, label }: { iconBg: string; icon: ReactNode; label: string }) => (
  <span className="inline-flex items-center gap-1 rounded border border-landing-text-200/15 bg-landing-text-200/15 pl-0.5 pr-1.5 py-0.5 align-middle">
    <span className={cn("inline-flex items-center justify-center size-4 rounded", iconBg)}>{icon}</span>
    <span className="text-landing-text-200 text-xs leading-none">{label}</span>
  </span>
);

// Signal event card inner content. No outer frame — callers wrap it (static
// border/bg here, animated wrapper in slack-to-signal-morph).
export const SignalContent = () => (
  <div className="w-full flex flex-col">
    <div className="flex items-center justify-between gap-2 pl-2 pr-3 py-2">
      <div className="flex items-center gap-1">
        {CLUSTER_PATH.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-landing-text-300 text-xs leading-none">/</span>}
            <ClusterCube color={c.color} />
          </span>
        ))}
        <span className="ml-1 text-white text-xs leading-none whitespace-nowrap">Git Workflow Automation Skills</span>
      </div>
      <X className="size-4 shrink-0 text-landing-text-300" strokeWidth={1.5} />
    </div>

    <div className="flex flex-col gap-4 px-4 pt-2 pb-3">
      <div className="flex gap-1.5 items-center">
        {ACTION_BUTTONS.map(({ Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-1 rounded-md border px-2 py-1"
            style={{ borderColor: withOpacity(ACCENT, 0.4) }}
          >
            <Icon className="size-3 shrink-0 text-landing-text-300" strokeWidth={1.5} />
            <span className="text-white text-xs leading-none whitespace-nowrap">{label}</span>
          </div>
        ))}
      </div>

      <p className="text-landing-text-300 text-sm leading-6">
        The agent pushed a commit without running the test suite. The{" "}
        <SpanChip
          iconBg="bg-llm"
          icon={<MessageCircle className="size-3 text-white" strokeWidth={2} />}
          label="claude-opus-4-7"
        />{" "}
        response proposed a fix but never verified it against the failing case, then invoked{" "}
        <SpanChip iconBg="bg-tool" icon={<Bolt className="size-3 text-white" strokeWidth={2} />} label="write_file" />{" "}
        to overwrite the test instead.
      </p>
    </div>
  </div>
);

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
