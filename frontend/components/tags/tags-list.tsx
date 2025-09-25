import { memo } from "react";

import { useTagsContext } from "@/components/tags/tags-context";
import { Badge } from "@/components/ui/badge";

const TagsList = () => {
  const { tags, tagClasses } = useTagsContext();

  if (!tags?.length) return null;

  return (
    <div className="flex flex-wrap w-fit items-center gap-2">
      {tags.map((t) => (
        <Badge key={t.id} className="rounded-3xl" variant="outline">
          <div
            style={{ background: tagClasses?.find((c) => c.name === t.name)?.color }}
            className="w-2 h-2 rounded-full"
          />
          <span className="ml-1.5">{tagClasses?.find((c) => c.name === t.name)?.name}</span>
        </Badge>
      ))}
    </div>
  );
};

export default memo(TagsList);
