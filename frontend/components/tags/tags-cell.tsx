import { TooltipPortal } from "@radix-ui/react-tooltip";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type TagClass } from "@/lib/traces/types";
import { cn, swrFetcher } from "@/lib/utils";

interface TagsCellProps {
  tags: string[];
}

const TagsCell = ({ tags }: TagsCellProps) => {
  const { projectId } = useParams();
  const { data: tagClasses = [] } = useSWR<TagClass[]>(
    projectId ? `/api/projects/${projectId}/tag-classes` : null,
    swrFetcher
  );

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
          <TooltipContent side="bottom" className="px-3 py-2 border">
            <div className="flex flex-col gap-1.5 items-start text-secondary-foreground">
              {resolvedTags.map((tag) => (
                <div key={tag.name} className="flex flex-row items-center gap-2">
                  <div
                    className={cn("size-2.5 rounded-full flex-shrink-0", !tag.color && "bg-gray-300")}
                    style={tag.color ? { backgroundColor: tag.color } : undefined}
                  />
                  <span className="text-xs">{tag.name}</span>
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
