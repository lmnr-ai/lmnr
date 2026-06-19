import { Skeleton } from "@/components/ui/skeleton";

export function SpanViewSkeleton() {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex flex-col px-2 pt-2 gap-2">
        <Skeleton className="h-5 w-full rounded" />
        <Skeleton className="h-5 w-full rounded" />
        <Skeleton className="h-5 w-full rounded" />
        <Skeleton className="h-5 w-full rounded" />
      </div>
      <div className="px-2 pb-2 mt-2 border-b" />
      <div className="flex flex-col gap-2 px-2 pt-2 flex-1">
        <Skeleton className="h-5 w-full rounded" />
        <Skeleton className="h-5 w-full rounded" />
        <Skeleton className="h-5 w-full rounded" />
      </div>
    </div>
  );
}
