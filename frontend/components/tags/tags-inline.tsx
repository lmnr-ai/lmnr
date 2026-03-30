import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";

import ManageTags from "@/components/tags/manage-tags";
import TagsContextProvider, { type TagsMode } from "@/components/tags/tags-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { useTagsContext } from "./tags-context";

const TagsInlineContent = () => {
  const { tags, tagClasses } = useTagsContext();

  return (
    <AnimatePresence>
      {tags.map((t) => (
        <motion.div
          key={t.id}
          initial={{ width: 0, opacity: 0, marginRight: 0 }}
          animate={{ width: "auto", opacity: 1, marginRight: 4 }}
          exit={{ width: 0, opacity: 0, marginRight: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className="overflow-hidden"
        >
          <Badge className="rounded-3xl whitespace-nowrap" variant="outline">
            <div
              style={{ background: tagClasses?.find((c) => c.name === t.name)?.color }}
              className="w-2 h-2 rounded-full"
            />
            <span className="ml-1.5">{t.name}</span>
          </Badge>
        </motion.div>
      ))}
      <ManageTags>
        <DropdownMenuTrigger asChild>
          {tags.length > 0 ? (
            <Button
              className="size-6 hover:bg-muted rounded-full grid place-items-center p-0"
              size="sm"
              variant="secondary"
            >
              <Plus size={14} />
            </Button>
          ) : (
            <Button size="sm" icon="tag" variant="secondary">
              <span>Tags</span>
            </Button>
          )}
        </DropdownMenuTrigger>
      </ManageTags>
    </AnimatePresence>
  );
};

const TagsInline = ({ mode }: { mode: TagsMode }) => (
  <TagsContextProvider mode={mode}>
    <TagsInlineContent />
  </TagsContextProvider>
);

export default TagsInline;
