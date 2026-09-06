import { Boxes } from "lucide-react";

interface ClusterListEmptyStateProps {
  title?: string;
}

export default function ClusterListEmptyState({
  title = "No clusters during this period",
}: ClusterListEmptyStateProps) {
  return (
    <div className="flex flex-1 h-full w-full items-center justify-center p-4">
      <div className="flex flex-col items-center text-center max-w-xs">
        <div className="flex items-center justify-center size-8 rounded-full bg-muted text-muted-foreground mb-3">
          <Boxes className="size-4" />
        </div>
        <h3 className="text-xs font-medium text-secondary-foreground">{title}</h3>
      </div>
    </div>
  );
}
