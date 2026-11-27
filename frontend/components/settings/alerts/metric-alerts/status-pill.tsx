import { CircleAlert, CircleCheck, CircleSlash, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

import { type AlertStatus, type AlertStatusTone } from "./utils";

const TONES: Record<AlertStatusTone, { icon: typeof CircleCheck; className: string }> = {
  ok: { icon: CircleCheck, className: "border-success-border text-success-text" },
  warning: { icon: TriangleAlert, className: "border-orange-400/40 text-orange-400" },
  critical: { icon: CircleAlert, className: "border-destructive-border text-destructive-text" },
  muted: { icon: CircleSlash, className: "text-muted-foreground" },
};

/** The level is carried by the icon and the word, not by the colour alone. */
export default function StatusPill({ status, className }: { status: AlertStatus; className?: string }) {
  const tone = TONES[status.tone];
  const Icon = tone.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
        tone.className,
        className
      )}
    >
      <Icon className="size-3" />
      {status.label}
    </span>
  );
}
