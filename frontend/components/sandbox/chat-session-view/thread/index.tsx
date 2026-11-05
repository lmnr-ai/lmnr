import { AlertTriangle } from "lucide-react";
import { Fragment } from "react";
import { shallow } from "zustand/shallow";

import { useSessionViewStore } from "@/components/traces/session-view/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { formatMs } from "../format";
import { useChatViewStore } from "../store";
import Turn from "./turn";

// Gaps shorter than this between turns aren't worth a divider.
const MIN_GAP_MS = 10 * 60_000;

export default function Thread() {
  const { traces, isLoading, error } = useSessionViewStore(
    (s) => ({ traces: s.traces, isLoading: s.isTracesLoading, error: s.tracesError }),
    shallow
  );
  const openTraceId = useChatViewStore((s) => s.openTraceId);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm">
        <AlertTriangle className="size-8 text-destructive-text" />
        {error}
      </div>
    );
  }

  if (isLoading && traces.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
        <Skeleton className="ml-auto h-10 w-1/2" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block">
      <div className="flex w-full flex-col py-4">
        {traces.map((t, i) => {
          const gap = i > 0 ? new Date(t.startTime).getTime() - new Date(traces[i - 1].endTime).getTime() : 0;
          return (
            <Fragment key={t.id}>
              {gap >= MIN_GAP_MS && (
                // h-px: the row is only as tall as the rule; the pill overflows it.
                <div className="mx-auto flex h-px w-full max-w-3xl items-center px-8 text-[11px] text-muted-foreground">
                  <div className="h-px flex-1 bg-border" />
                  <span
                    className={cn(
                      "relative z-10 flex h-[19px] items-center rounded-full border border-transparent bg-transparent px-2 leading-none",
                      (openTraceId === t.id || openTraceId === traces[i - 1].id) && "border-border bg-surface-350"
                    )}
                  >
                    {formatMs(gap)}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              )}
              <Turn trace={t} />
            </Fragment>
          );
        })}
      </div>
    </ScrollArea>
  );
}
