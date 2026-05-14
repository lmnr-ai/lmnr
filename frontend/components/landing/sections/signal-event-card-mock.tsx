import { ArrowUpRight, Bolt, Box, MessageCircle, Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const ACCENT = "rgb(49 134 255)";

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
  { Icon: ArrowUpRight, label: "Open cluster" },
];

const ClusterCube = ({ color }: { color: string }) => (
  <Box className="size-3 shrink-0" fill={withOpacity(color, 0.15)} stroke={withOpacity(color, 0.8)} strokeWidth={1.5} />
);

const SpanChip = ({ iconBg, icon, label }: { iconBg: string; icon: React.ReactNode; label: string }) => (
  <span className="inline-flex items-center gap-1 rounded border border-landing-text-200/15 bg-landing-text-200/15 pl-0.5 pr-1.5 py-0.5 align-middle">
    <span className={cn("inline-flex items-center justify-center size-4 rounded", iconBg)}>{icon}</span>
    <span className="text-landing-text-200 text-xs leading-none">{label}</span>
  </span>
);

const SignalEventCardMock = ({ className }: Props) => (
  <div
    className={cn("flex w-full max-w-[400px] flex-col overflow-hidden rounded-md bg-landing-surface-700", className)}
  >
    <div
      className="size-full flex flex-col border rounded-md"
      style={{
        borderColor: withOpacity(ACCENT, 0.6),
        backgroundColor: withOpacity(ACCENT, 0.12),
      }}
    >
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

        <div className="flex flex-col gap-1 w-full">
          <p className="text-landing-text-300 text-sm leading-6">
            The agent claimed its task was complete and pushed a commit without running the test suite first. The{" "}
            <SpanChip
              iconBg="bg-llm"
              icon={<MessageCircle className="size-3 text-white" strokeWidth={2} />}
              label="claude-opus-4-7"
            />{" "}
            response acknowledged the gap and proposed a fix, but never verified it against the failing case before
            continuing. Shortly after, the agent invoked{" "}
            <SpanChip
              iconBg="bg-tool"
              icon={<Bolt className="size-3 text-white" strokeWidth={2} />}
              label="write_file"
            />{" "}
            to overwrite the test rather than addressing the underlying issue.
          </p>
        </div>
      </div>
    </div>
  </div>
);

export default SignalEventCardMock;
