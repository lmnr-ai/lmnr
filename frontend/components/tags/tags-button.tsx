import { Tag } from "lucide-react";

import ManageTags from "@/components/tags/manage-tags";
import TagsContextProvider, { type TagsMode, useTagsContext } from "@/components/tags/tags-context";
import { Button } from "@/components/ui/button";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const TagsButtonContent = ({ className }: { className?: string }) => {
  const { tags, tagClasses } = useTagsContext();

  return (
    <ManageTags>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-6 text-xs px-1.5 gap-1.5", className)}>
          {tags.length > 0 ? (
            <div className="flex -space-x-[6px]">
              {tags.map((tag) => {
                const color = tagClasses.find((c) => c.name === tag.name)?.color;
                return (
                  <div
                    key={tag.id}
                    className="size-3.5 border border-background rounded-full"
                    style={{ background: color }}
                  />
                );
              })}
            </div>
          ) : (
            <Tag className="size-3.5" />
          )}
          Tags
        </Button>
      </DropdownMenuTrigger>
    </ManageTags>
  );
};

interface TagsButtonProps {
  mode: TagsMode;
  className?: string;
}

const TagsButton = ({ mode, className }: TagsButtonProps) => (
  <TagsContextProvider mode={mode}>
    <TagsButtonContent className={className} />
  </TagsContextProvider>
);

export default TagsButton;
