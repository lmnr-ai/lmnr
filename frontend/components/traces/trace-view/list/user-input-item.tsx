import { User } from "lucide-react";

import { CollapsedTextWithMore } from "@/components/traces/trace-view/list/collapsed-text-with-more";
import { Skeleton } from "@/components/ui/skeleton";

interface UserInputItemProps {
  text: string | null;
  isLoading: boolean;
}

export function UserInputItem({ text, isLoading }: UserInputItemProps) {
  if (isLoading) {
    return (
      <div className="flex gap-2 items-start px-3 py-2">
        <Skeleton className="w-5 h-5 shrink-0 rounded" />
        <Skeleton className="h-5 flex-1" />
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="flex gap-2 items-start px-3 py-2 border-l-4 border-l-transparent">
      <div className="flex items-center justify-center z-10 rounded shrink-0 bg-muted-foreground/60 w-5 h-5 min-w-5 min-h-5">
        <User size={14} />
      </div>
      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
        <span className="font-medium text-[13px] whitespace-nowrap shrink-0">User</span>
        <CollapsedTextWithMore text={text} lineHeight={17} />
      </div>
    </div>
  );
}
