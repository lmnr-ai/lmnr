import { Mail } from "lucide-react";

import { IconSlack } from "@/components/ui/icons";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { type AlertTarget } from "@/lib/actions/alerts/types";
import { cn } from "@/lib/utils";

const label = (t: AlertTarget) =>
  t.type === "SLACK" ? (t.channelName ? `#${t.channelName}` : (t.channelId ?? "unknown")) : (t.email ?? "unknown");

function TargetItem({ target }: { target: AlertTarget }) {
  const Icon = target.type === "SLACK" ? IconSlack : Mail;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{label(target)}</span>
    </span>
  );
}

/** Plain-text targets with icons; overflow collapses into a "+N" with a tooltip. */
export default function AlertTargets({
  targets,
  max = 2,
  className,
}: {
  targets: AlertTarget[];
  max?: number;
  className?: string;
}) {
  if (targets.length === 0) {
    return <span className={cn("text-xs text-muted-foreground italic", className)}>No destination</span>;
  }
  const shown = targets.slice(0, max);
  const rest = targets.slice(max);
  return (
    <div className={cn("flex min-w-0 items-center gap-3 text-xs", className)}>
      {shown.map((t) => (
        <TargetItem key={t.id} target={t} />
      ))}
      {rest.length > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0 text-muted-foreground">+{rest.length}</span>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent className="flex flex-col gap-1">
              {rest.map((t) => (
                <TargetItem key={t.id} target={t} />
              ))}
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      )}
    </div>
  );
}
