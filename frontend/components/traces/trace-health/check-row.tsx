import { ChevronDown, EyeOff, SquareArrowOutUpRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import RotatingAgentIcon from "@/components/landing/hero/rotating-agent-icon";
import { SeverityIcon } from "@/components/notifications/notification-panel/severity-icon";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CopyButton } from "@/components/ui/copy-button";
import { TRACE_HEALTH_CATEGORIES, type TraceHealthCheck, type TraceHealthCheckResult } from "@/lib/trace-health/checks";
import { buildFixPrompt } from "@/lib/trace-health/prompt";
import { cn } from "@/lib/utils";

interface CheckRowProps {
  check: TraceHealthCheck;
  result: TraceHealthCheckResult;
  onOpenTrace: (traceId: string) => void;
  onHide: () => void;
}

export default function CheckRow({ check, result, onOpenTrace, onHide }: CheckRowProps) {
  const [open, setOpen] = useState(false);
  const { projectId } = useParams<{ projectId: string }>();
  const sampleTraceId = result.sampleTraceId;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="relative rounded-md border hover:overlay-hover has-[>button:focus-visible]:ring-1 has-[>button:focus-visible]:ring-ring"
    >
      <CollapsibleTrigger className="flex w-full items-start gap-3 px-3 py-2.5 text-left outline-none">
        <SeverityIcon severity={TRACE_HEALTH_CATEGORIES[check.category].advisory ? 0 : 2} className="mt-0.5 size-4" />
        {/* Right margin keeps the title clear of the Hide button overlaid on the trigger. */}
        <div className="mr-16 flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{check.title}</span>
          <span className="text-xs text-muted-foreground">
            {result.failing.toLocaleString()} of {result.applicable.toLocaleString()} {check.unit}
          </span>
        </div>
        <ChevronDown
          className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      {/* A sibling of the trigger, not a child: a button can't nest inside the trigger's button. */}
      <Button variant="ghost" className="absolute top-2 right-9 h-7 text-xs text-muted-foreground" onClick={onHide}>
        <EyeOff className="mr-1.5 size-3.5" />
        Hide
      </Button>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {/* The trigger owns keyboard toggling; this lets the expanded body collapse on click too. */}
        <div className="flex cursor-pointer flex-col gap-3 px-3 pb-3 pl-10" onClick={() => setOpen(false)}>
          <p className="text-xs text-muted-foreground">Fix: {check.fix}</p>
          <div className="flex w-fit cursor-default items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <CopyButton
              text={buildFixPrompt([result])}
              iconClassName="size-3.5"
              icon={<RotatingAgentIcon className="mr-2 size-3.5 text-current" />}
            >
              Copy prompt
            </CopyButton>
            {check.link && (
              <Button asChild variant="ghost" className="text-muted-foreground">
                <Link href={`/project/${projectId}/${check.link.path}`}>
                  {check.link.label}
                  <SquareArrowOutUpRight className="ml-1.5 size-3.5" />
                </Link>
              </Button>
            )}
            {sampleTraceId && (
              <Button variant="ghost" className="text-muted-foreground" onClick={() => onOpenTrace(sampleTraceId)}>
                View example trace
                <SquareArrowOutUpRight className="ml-1.5 size-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
