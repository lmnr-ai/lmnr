import { TooltipPortal } from "@radix-ui/react-tooltip";
import { useMemo } from "react";

import { useTracesStoreContext } from "@/components/traces/traces-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TagsCellProps {
  tags: string[];
}

const TagsCell = ({ tags }: TagsCellProps) => {
  const tagClasses = useTracesStoreContext((state) => state.tagClasses);

  const resolvedTags = useMemo(
    () =>
      tags.map((name) => {
        const tc = tagClasses.find((c) => c.name === name);
        return { name, color: tc?.color };
      }),
    [tags, tagClasses]
  );

  const count = resolvedTags.length;

  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            <div className="flex flex-row items-center -space-x-2">
              {resolvedTags.map((tag) => (
                <div
                  key={tag.name}
                  className={cn("size-4 rounded-full border-2 border-secondary", !tag.color && "bg-gray-300")}
                  style={tag.color ? { backgroundColor: tag.color } : undefined}
                />
              ))}
            </div>
            <span className="text-secondary-foreground text-xs">
              {count} tag{count === 1 ? "" : "s"}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom" className="p-2 border">
            <div className="flex flex-col gap-1 items-start">
              {resolvedTags.map((tag) => (
                <div key={tag.name} className="flex flex-row items-center gap-2">
                  <div
                    className={cn("size-3 rounded-full flex-shrink-0", !tag.color && "bg-gray-300")}
                    style={tag.color ? { backgroundColor: tag.color } : undefined}
                  />
                  <span className="text-sm">{tag.name}</span>
                </div>
              ))}
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
};

export default TagsCell;
