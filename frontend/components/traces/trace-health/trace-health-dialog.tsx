import { Loader2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TRACE_HEALTH_CATEGORIES,
  TRACE_HEALTH_CHECKS,
  TRACE_HEALTH_RANGES,
  type TraceHealthCategory,
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
  const [pastHours, setPastHours] = useState<number>(TRACE_HEALTH_RANGES[0].pastHours);
  const { data, isLoading, isValidating, error } = useTraceHealth(pastHours, open);

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
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-4">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Trace health</DialogTitle>
            <div className="flex items-center gap-2">
              {failing.length > 0 && (
                <CopyButton text={buildFixPrompt(failing.map(({ result }) => result))} iconClassName="size-3.5">
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
          <DialogDescription>
            Trace health flags tracing setup issues that limit your evals and insights.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            {data ? `${fixCount} ${fixCount === 1 ? "fix" : "fixes"} found` : "Checking traces…"}
            {isValidating && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          </span>
          <Select value={String(pastHours)} onValueChange={(v) => setPastHours(Number(v))}>
            <SelectTrigger className="h-7 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRACE_HEALTH_RANGES.map((r) => (
                <SelectItem key={r.pastHours} value={String(r.pastHours)} className="text-xs">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-2 pb-1">
          {error && !data && <p className="text-sm text-destructive-text">Failed to run trace health checks.</p>}
          {isLoading && !data && (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {categories.map(({ category, items }) => (
            <section key={category} className="flex flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {TRACE_HEALTH_CATEGORIES[category].title} · {items.length}
                </span>
                <span className="text-xs text-muted-foreground">{TRACE_HEALTH_CATEGORIES[category].description}</span>
              </div>
              {items.map(({ check, result }) => (
                <CheckRow key={check.id} check={check} result={result} onOpenTrace={openTrace} />
              ))}
            </section>
          ))}
          {data && <PassingChecks items={passing} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
