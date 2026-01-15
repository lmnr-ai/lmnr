import { Skeleton } from "@/components/ui/skeleton.tsx";

export default async function EventsPageLoading() {
  return (
    <div className="flex flex-col flex-1 w-full h-full min-h-screen gap-4 p-4">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-50 w-full" />
    </div>
  );
}
