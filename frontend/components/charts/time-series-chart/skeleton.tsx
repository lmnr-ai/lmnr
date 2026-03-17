import { Skeleton } from "@/components/ui/skeleton";

export const ChartSkeleton = () => {
  const getHeight = (index: number) => 20 + ((index * 17 + index * index) % 32);

  return (
    <div className="w-full overflow-hidden">
      <div className="flex flex-col gap-1 pt-4 pb-3">
        <div className="h-36 w-full flex items-end gap-[2px]">
          {Array.from({ length: 48 }).map((_, i) => (
            <Skeleton
              key={i}
              className="flex-1 min-w-0 rounded-t"
              style={{
                height: `${getHeight(i)}%`,
              }}
            />
          ))}
        </div>
        <div className="flex items-end gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 min-w-0 rounded-t h-4" />
          ))}
        </div>
      </div>
      <Skeleton className="h-4 w-20" />
    </div>
  );
};
