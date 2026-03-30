import { motion } from "framer-motion";
import { memo } from "react";

import { useTagsContext } from "@/components/tags/tags-context";
import { Badge } from "@/components/ui/badge";

const TagsList = () => {
  const { tags, tagClasses } = useTagsContext();

  if (!tags?.length) return null;

  return (
    <>
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
    </>
  );
};

export default memo(TagsList);
