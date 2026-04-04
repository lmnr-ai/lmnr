"use client";

import { Tag } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";
import { type SpanTag, type TagClass } from "@/lib/traces/types";
import { cn, swrFetcher } from "@/lib/utils";

import TagsDropdown, { type Tag as TagType } from "./tags-dropdown";

interface SpanTagsButtonProps {
  spanId: string;
  className?: string;
}

const SpanTagsButton = ({ spanId, className }: SpanTagsButtonProps) => {
  const { projectId } = useParams();
  const { toast } = useToast();

  const { data: tagClasses = [], mutate: mutateTagClasses } = useSWR<TagClass[]>(
    `/api/projects/${projectId}/tag-classes`,
    swrFetcher
  );

  const { data: rawTags = [], mutate: mutateTags } = useSWR<SpanTag[]>(
    spanId ? `/api/projects/${projectId}/spans/${spanId}/tags` : null,
    swrFetcher
  );

  const tags: TagType[] = useMemo(
    () =>
      rawTags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color ?? tagClasses.find((c) => c.name === t.name)?.color,
      })),
    [rawTags, tagClasses]
  );

  // Auto-create tag classes for span tags that don't have one
  const createNewTagClasses = useCallback(async () => {
    const tagClassNames = new Set(tagClasses.map((tc) => tc.name));
    const newTags = rawTags.filter((tag) => !tagClassNames.has(tag.name));
    if (newTags.length === 0) return;
    try {
      for (const tag of newTags) {
        await fetch(`/api/projects/${projectId}/tag-classes/${tag.name}`, {
          method: "POST",
          body: JSON.stringify({ color: tag.color }),
        });
      }
    } catch (e) {
      console.error("Error creating tag classes:", e);
    }
    mutateTagClasses();
  }, [rawTags, tagClasses, projectId, mutateTagClasses]);

  useEffect(() => {
    createNewTagClasses();
  }, [createNewTagClasses]);

  const onAttach = async (tagClassName: string) => {
    const res = await fetch(`/api/projects/${projectId}/spans/${spanId}/tags`, {
      method: "POST",
      body: JSON.stringify({ name: tagClassName }),
    });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to attach tag" });
      return;
    }
    const data = (await res.json()) as SpanTag;
    await mutateTags([...rawTags, data], { revalidate: false });
  };

  const onDetach = async (tag: TagType) => {
    await mutateTags(
      async () => {
        const res = await fetch(`/api/projects/${projectId}/spans/${spanId}/tags/${encodeURIComponent(tag.id)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Failed to delete tag");
        return rawTags.filter((t) => t.id !== tag.id);
      },
      {
        optimisticData: rawTags.filter((t) => t.id !== tag.id),
        rollbackOnError: true,
        revalidate: false,
      }
    );
  };

  const onCreateAndAttach = async (name: string, color: string) => {
    const tcRes = await fetch(`/api/projects/${projectId}/tag-classes/${name}`, {
      method: "POST",
      body: JSON.stringify({ color }),
    });
    if (!tcRes.ok) {
      toast({ variant: "destructive", title: "Failed to create tag" });
      return;
    }
    const newClass = (await tcRes.json()) as TagClass;
    await mutateTagClasses([...tagClasses, newClass], { revalidate: false });

    const tagRes = await fetch(`/api/projects/${projectId}/spans/${spanId}/tags`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    if (!tagRes.ok) {
      toast({ variant: "destructive", title: "Failed to attach tag" });
      return;
    }
    const newTag = (await tagRes.json()) as SpanTag;
    await mutateTags([...rawTags, newTag], { revalidate: false });
  };

  return (
    <TagsDropdown
      tags={tags}
      tagClasses={tagClasses}
      onAttach={onAttach}
      onDetach={onDetach}
      onCreateAndAttach={onCreateAndAttach}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-6 text-xs px-1.5 gap-1.5", className)}>
          {tags.length > 0 ? (
            <div className="flex -space-x-[6px]">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className={cn("size-3.5 border border-background rounded-full", !tag.color && "bg-gray-300")}
                  style={tag.color ? { background: tag.color } : undefined}
                />
              ))}
            </div>
          ) : (
            <Tag className="size-3.5" />
          )}
          Tags
        </Button>
      </DropdownMenuTrigger>
    </TagsDropdown>
  );
};

export default SpanTagsButton;
