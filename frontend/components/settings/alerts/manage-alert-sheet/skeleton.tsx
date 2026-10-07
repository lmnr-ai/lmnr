import { Skeleton } from "@/components/ui/skeleton";

export function AlertFormSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div className="grid gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-full" />
      </div>
      <Skeleton className="flex-1 w-full" />
    </div>
  );
}
