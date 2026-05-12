import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VersionBadgeProps {
  className?: string;
}

export default function VersionBadge({ className }: VersionBadgeProps) {
  if (process.env.LAMINAR_CLOUD === "true") return null;
  const version = process.env.NEXT_PUBLIC_LAMINAR_VERSION;
  if (!version) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "text-[10px] leading-none text-muted-foreground/70 font-mono tabular-nums tracking-tight select-none",
              className
            )}
          >
            {version}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Laminar {version}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
