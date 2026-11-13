import { Loader2, X } from "lucide-react";
import { useMemo } from "react";

import RotatingAgentIcon from "@/components/landing/hero/rotating-agent-icon";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TRACE_HEALTH_CATEGORIES, TRACE_HEALTH_CHECKS, type TraceHealthCategory } from "@/lib/trace-health/checks";
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
  const { data, isLoading, error } = useTraceHealth();

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
      <DialogContent aria-describedby={undefined} className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4">
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

        <span className="px-4 pt-3 text-sm font-medium text-muted-foreground">
          {data
            ? `${fixCount} ${fixCount === 1 ? "fix" : "fixes"} found in the last ${data.traceCount} traces`
            : "Checking traces…"}
        </span>

        <ScrollArea viewportClassName="scroll-fade-y max-h-[65vh]">
          <div className="flex flex-col gap-5 px-4 pt-3 pb-4">
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
