"use client";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useTagsContext } from "@/components/tags/tags-context";
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/use-toast";
import { defaultColors } from "@/lib/tags/colors";
import { SpanTag, TagClass } from "@/lib/traces/types";


interface CreateTagProps {
  name: string;
}

const CreateTag = ({ name }: CreateTagProps) => {
  const [query, setQuery] = useState("");
  const params = useParams();
  const colors = useMemo(
    () => defaultColors.filter((tag) => tag.name.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  const { toast } = useToast();
  const { tagClasses: tagClasses, mutateTagClass: mutateTagClass, mutate, tags: tags, spanId } = useTagsContext();

  const handleCreateTagClass = async (color: string) => {
    try {
      const response = await fetch(`/api/projects/${params?.projectId}/tag-classes/${name}`, {
        method: "POST",
        body: JSON.stringify({
          color,
        }),
      });

      if (!response.ok) {
        toast({ variant: "destructive", title: "Error", description: "Failed to create tag." });
        return;
      }

      const data = (await response.json()) as TagClass;
      await mutateTagClass([...tagClasses, data], {
        revalidate: false,
      });

      // attach tag right away
      const res = await fetch(`/api/projects/${params?.projectId}/spans/${spanId}/tags`, {
        method: "POST",
        body: JSON.stringify({
          name: data.name,
        }),
      });

      if (!res.ok) {
        toast({ variant: "destructive", title: "Error", description: "Failed to attach tag." });
        return;
      }
      const tag = (await res.json()) as SpanTag;

      await mutate([...tags, tag], {
        revalidate: false,
      });
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    }
  };

  return (
    <>
      <Input
        autoFocus
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Pick a color for tag..."
        className="border-none bg-transparent focus-visible:ring-0 flex-1 h-fit rounded-none"
      />
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {colors.map((c) => (
          <DropdownMenuItem onSelect={() => handleCreateTagClass(c.color)} key={c.name}>
            <div style={{ background: c.color }} className={`w-2 h-2 rounded-full`} />
            <span className="ml-1.5">{c.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </>
  );
};

export default CreateTag;
