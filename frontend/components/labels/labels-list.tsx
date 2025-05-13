import { useLabelsContext } from "@/components/labels/labels-context";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const LabelsList = () => {
  const { labels, labelClasses, isLoading } = useLabelsContext();

  return (
    <div className="flex flex-wrap w-fit items-center gap-2">
      {isLoading ? (
        <>
          <Skeleton className="h-5 w-12 rounded-3xl" />
          <Skeleton className="h-5 w-12 rounded-3xl" />
          <Skeleton className="h-5 w-12 rounded-3xl" />
        </>
      ) : (
        labels.map((l) => (
          <Badge key={l.id} className="rounded-3xl" variant="outline">
            <div
              style={{ background: labelClasses?.find((c) => c.id === l.classId)?.color }}
              className={`w-2 h-2 rounded-full`}
            />
            <span className="ml-1.5">{labelClasses?.find((c) => c.id === l.classId)?.name}</span>
          </Badge>
        ))
      )}
    </div>
  );
};

export default LabelsList;
