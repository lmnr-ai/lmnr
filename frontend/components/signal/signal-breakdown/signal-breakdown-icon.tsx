import { Circle, GitBranch, GitCommitHorizontal } from "lucide-react";

import { SeverityIcon } from "@/components/notifications/notification-panel/severity-icon";
import ClusterIcon from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import { withOpacity } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import { type BreakdownIcon } from "./types";

/** Dispatches an agnostic BreakdownIcon to the right concrete glyph. */
export default function SignalBreakdownIcon({
  icon,
  isSelected,
  isPaywall,
}: {
  icon: BreakdownIcon;
  isSelected?: boolean;
  isPaywall?: boolean;
}) {
  switch (icon.type) {
    case "cluster":
      return (
        <ClusterIcon iconVariant={icon.variant} color={icon.color} isSelected={isSelected} isPaywall={isPaywall} />
      );
    case "severity":
      return (
        <div className={cn("size-4 flex justify-center items-center", { "blur-[5px]": isPaywall })}>
          <SeverityIcon severity={icon.severity} />
        </div>
      );
    case "agent":
      return (
        <div className={cn("size-4 flex justify-center items-center", { "blur-[5px]": isPaywall })}>
          {icon.isVersion ? (
            <GitCommitHorizontal className="size-3.5 shrink-0" stroke={icon.color} strokeWidth={1.75} />
          ) : (
            <GitBranch className="size-3.5 shrink-0" stroke={icon.color} strokeWidth={1.75} />
          )}
        </div>
      );
    case "dot":
      return (
        <div className={cn("size-4 flex justify-center items-center", { "blur-[5px]": isPaywall })}>
          <Circle
            className="size-3 shrink-0"
            fill={icon.filled ? withOpacity(icon.color, 0.7) : "transparent"}
            stroke={icon.color}
            strokeWidth={1.5}
          />
        </div>
      );
  }
}
