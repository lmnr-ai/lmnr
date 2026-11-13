import { Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";

import RotatingAgentIcon from "@/components/landing/hero/rotating-agent-icon";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  TRACE_HEALTH_CATEGORIES,
  TRACE_HEALTH_CHECKS,
  DEFAULT_TRACE_HEALTH_RANGE,
  type TraceHealthCategory,
  type TraceHealthTimeRange,
} from "@/lib/trace-health/checks";
import { buildFixPrompt } from "@/lib/trace-health/prompt";

import CheckRow from "./check-row";
import PassingChecks from "./passing-checks";
import { useTraceHealth } from "./use-trace-health";

interface TraceHealthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTrace: (traceId: string) => void;
}

export default function TraceHealthDialog({ open, onOpenChange, onOpenTrace }: TraceHealthDialogProps) {
  const [range, setRange] = useState<TraceHealthTimeRange>(DEFAULT_TRACE_HEALTH_RANGE);
  const { data, isLoading, isValidating, error } = useTraceHealth(range, open);

  const { failing, passing } = useMemo(() => {
    const items = TRACE_HEALTH_CHECKS.flatMap((check) => {
      const result = data?.results.find((r) => r.id === check.id);
      return result ? [{ check, result }] : [];
    });
    return {
      failing: items.filter(({ result }) => result.failing > 0),
      passing: items.filter(({ result }) => result.failing === 0),
    };
  }, [data]);

  const categories = (Object.keys(TRACE_HEALTH_CATEGORIES) as TraceHealthCategory[])
    .map((category) => ({ category, items: failing.filter(({ check }) => check.category === category) }))
    .filter(({ items }) => items.length > 0);
  const fixCount = failing.filter(({ check }) => !TRACE_HEALTH_CATEGORIES[check.category].advisory).length;

  const openTrace = (traceId: string) => {
    onOpenChange(false);
    onOpenTrace(traceId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="flex max-h-[85vh] max-w-2xl flex-col gap-4">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Tracing issues detected</DialogTitle>
            <div className="flex items-center gap-2">
              {failing.length > 0 && (
                <CopyButton
                  variant="default"
                  text={buildFixPrompt(failing.map(({ result }) => result))}
                  iconClassName="size-3.5"
                  icon={<RotatingAgentIcon className="mr-2 size-3.5 text-current" />}
                >
                  Copy prompt
                </CopyButton>
              )}
              <DialogClose asChild>
                <Button variant="ghost" size="icon" aria-label="Close">
                  <X className="size-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {data ? `${fixCount} ${fixCount === 1 ? "fix" : "fixes"} found` : "Checking traces…"}
            {isValidating && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          </span>
          <DateRangeFilter mode="state" value={range} onChange={setRange} className="h-7 text-xs" />
        </div>

        <ScrollArea className="-mr-3" viewportClassName="scroll-fade-y max-h-[65vh]">
          <div className="flex flex-col gap-5 py-2 pr-3">
            {error && !data && <p className="text-sm text-destructive-text">Failed to run trace health checks.</p>}
            {isLoading && !data && (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {categories.map(({ category, items }) => (
              <section key={category} className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {TRACE_HEALTH_CATEGORIES[category].title}
                </span>
                {items.map(({ check, result }) => (
                  <CheckRow key={check.id} check={check} result={result} onOpenTrace={openTrace} />
                ))}
              </section>
            ))}
            {data && <PassingChecks items={passing} />}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
