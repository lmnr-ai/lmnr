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
import { buildCheckTableHref } from "@/lib/trace-health/links";
import { buildFixPrompt } from "@/lib/trace-health/prompt";
import { cn } from "@/lib/utils";

interface CheckRowProps {
  check: TraceHealthCheck;
  result: TraceHealthCheckResult;
  oldestStart: string | null;
  /** Called when a link leaves the dialog for the filtered table. */
  onNavigate: () => void;
  onHide: () => void;
}

export default function CheckRow({ check, result, oldestStart, onNavigate, onHide }: CheckRowProps) {
  const [open, setOpen] = useState(false);
  const { projectId } = useParams<{ projectId: string }>();
  const tableHref = buildCheckTableHref(projectId, check, result, oldestStart);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border hover:overlay-hover has-[>div>button:focus-visible]:ring-1 has-[>div>button:focus-visible]:ring-ring"
    >
      <div className="relative">
        <CollapsibleTrigger className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left outline-none">
          <div className="flex w-full items-center gap-3">
            <SeverityIcon severity={TRACE_HEALTH_CATEGORIES[check.category].advisory ? 0 : 2} className="size-4" />
            <span className="flex-1 text-sm font-medium">{check.title}</span>
            {/* Space for the Hide button, which sits over the trigger rather than inside it. */}
            <span className="w-16 shrink-0" />
            <ChevronDown
              className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </div>
          {/* pl-7 = icon (16px) + gap (12px), so the count lines up with the title. */}
          <span className="pl-7 text-xs text-foreground-200">
            {result.failing.toLocaleString()} of {result.applicable.toLocaleString()} {check.unit}
          </span>
        </CollapsibleTrigger>
        {/* A sibling of the trigger (a button can't nest in its button), aligned to the title row. */}
        <Button variant="ghost" className="absolute top-1.5 right-9 h-7 text-xs text-muted-foreground" onClick={onHide}>
          <EyeOff className="mr-1.5 size-3.5" />
          Hide
        </Button>
      </div>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {/* The trigger owns keyboard toggling; this lets the expanded body collapse on click too. */}
        <div className="flex cursor-pointer flex-col gap-3 px-3 pb-3 pl-10" onClick={() => setOpen(false)}>
          <p className="text-xs text-muted-foreground">Fix: {check.fix}</p>
          <div className="flex w-fit cursor-default items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <CopyButton
              className="bg-transparent"
              text={buildFixPrompt([result])}
              iconClassName="size-3.5"
              icon={<RotatingAgentIcon className="mr-2 size-3.5 text-foreground-200" />}
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
            {tableHref && (
              <Button asChild variant="ghost" className="text-muted-foreground">
                <Link href={tableHref} onClick={onNavigate}>
                  View {check.table.view}
                  <SquareArrowOutUpRight className="ml-1.5 size-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
