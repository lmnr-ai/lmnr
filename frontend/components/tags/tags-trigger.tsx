import { isNil } from "lodash";
import { Plus } from "lucide-react";
import { type ReactNode } from "react";

import ManageTags from "@/components/tags/manage-tags";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { Button } from "../ui/button";
import { useTagsContext } from "./tags-context";

interface TagsProps {
  isMinimal?: boolean;
  children?: ReactNode;
}

const Tags = ({ isMinimal = false, children }: TagsProps) => {
  const { tags } = useTagsContext();

  const variant = !isNil(children) ? "children" : tags.length !== 0 && isMinimal ? "minimal" : "regular";

  const trigger = (() => {
    switch (variant) {
      case "children":
        return children;
      case "minimal":
        return (
          <Button
            className="size-6 hover:bg-muted rounded-full grid place-items-center p-0"
            size="sm"
            variant="secondary"
          >
            <Plus size={14} />
          </Button>
        );
      case "regular":
        return (
          <Button size="sm" icon="tag" variant="secondary">
            <span>Tags</span>
          </Button>
        );
    }
  })();

  return (
    <ManageTags>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
    </ManageTags>
  );
};

export default Tags;
