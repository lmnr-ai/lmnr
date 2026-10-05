import { times } from "lodash";

import { SpanViewSkeleton } from "@/components/traces/span-view/skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function TraceViewSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="flex h-full w-full flex-col md:w-[60%]">
        <div className="flex items-center gap-2 border-b px-2 py-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="flex flex-col gap-2 p-2">
          {times(3, (i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="hidden h-full min-w-0 flex-1 border-l md:block">
        <SpanViewSkeleton />
      </div>
    </div>
  );
}
