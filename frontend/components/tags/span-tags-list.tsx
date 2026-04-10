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

import { Badge } from "../ui/badge";
import TagsDropdown, { type Tag as TagType } from "./tags-dropdown";

interface SpanTagsListProps {
  spanId: string;
  className?: string;
}

const SpanTagsList = ({ spanId, className }: SpanTagsListProps) => {
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
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Failed to create tag classes" });
    }
    mutateTagClasses();
  }, [rawTags, tagClasses, projectId, mutateTagClasses]);

  useEffect(() => {
    createNewTagClasses();
  }, [createNewTagClasses]);

  const onAttach = async (tagClassName: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/spans/${spanId}/tags`, {
        method: "POST",
        body: JSON.stringify({ name: tagClassName }),
      });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        throw new Error(errMessage ?? "Failed to attach tag");
      }
      const data = (await res.json()) as SpanTag;
      await mutateTags([...rawTags, data], { revalidate: false });
    } catch (e) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Something went wrong" });
    }
  };

  const onDetach = async (tag: TagType) => {
    try {
      await mutateTags(
        async () => {
          const res = await fetch(`/api/projects/${projectId}/spans/${spanId}/tags/${encodeURIComponent(tag.id)}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const errMessage = await res
              .json()
              .then((d) => d?.error)
              .catch(() => null);
            throw new Error(errMessage ?? "Failed to delete tag");
          }
          return rawTags.filter((t) => t.id !== tag.id);
        },
        {
          optimisticData: rawTags.filter((t) => t.id !== tag.id),
          rollbackOnError: true,
          revalidate: false,
        }
      );
    } catch (e) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Something went wrong" });
    }
  };

  const onCreateAndAttach = async (name: string, color: string) => {
    try {
      const tcRes = await fetch(`/api/projects/${projectId}/tag-classes/${name}`, {
        method: "POST",
        body: JSON.stringify({ color }),
      });
      if (!tcRes.ok) {
        const errMessage = await tcRes
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        throw new Error(errMessage ?? "Failed to create tag");
      }
      const newClass = (await tcRes.json()) as TagClass;
      await mutateTagClasses([...tagClasses, newClass], { revalidate: false });

      const tagRes = await fetch(`/api/projects/${projectId}/spans/${spanId}/tags`, {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      if (!tagRes.ok) {
        const errMessage = await tagRes
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        throw new Error(errMessage ?? "Failed to attach tag");
      }
      const newTag = (await tagRes.json()) as SpanTag;
      await mutateTags([...rawTags, newTag], { revalidate: false });
    } catch (e) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Something went wrong" });
    }
  };

  return (
    <>
      <TagsDropdown
        tags={tags}
        tagClasses={tagClasses}
        onAttach={onAttach}
        onDetach={onDetach}
        onCreateAndAttach={onCreateAndAttach}
      >
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn("h-6 text-xs px-1.5 gap-1.5", className)}>
            <Tag className="size-3.5" />
            Tags
          </Button>
        </DropdownMenuTrigger>
      </TagsDropdown>
      {tags.map(({ name, color, id }) => (
        <Badge key={id} variant="outline" className="rounded-full gap-1">
          <div className="rounded-full size-2.5 bg-gray-300" style={{ backgroundColor: color }} />
          {name}
        </Badge>
      ))}
    </>
  );
};

export default SpanTagsList;
