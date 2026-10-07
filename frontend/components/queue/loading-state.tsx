import Header from "@/components/ui/header";
import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingState({ name }: { name: string }) {
  return (
    <>
      <Header path={`labeling queues/${name}`} />
      <div className="px-4 pb-4 flex flex-col flex-1 gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-full flex-1" />
      </div>
    </>
  );
}
