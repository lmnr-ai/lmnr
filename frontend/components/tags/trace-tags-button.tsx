"use client";

import { Plus, Tag } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";
import { type TagClass } from "@/lib/traces/types";
import { cn, swrFetcher } from "@/lib/utils";

import TagsDropdown, { type Tag as TagType } from "./tags-dropdown";

interface TraceTagsButtonProps {
  traceId: string;
  className?: string;
}

const TraceTagsButton = ({ traceId, className }: TraceTagsButtonProps) => {
  const { projectId } = useParams();
  const { toast } = useToast();

  const { data: tagClasses = [], mutate: mutateTagClasses } = useSWR<TagClass[]>(
    `/api/projects/${projectId}/tag-classes`,
    swrFetcher
  );

  const { data: rawTags = [], mutate: mutateTags } = useSWR<string[]>(
    traceId ? `/api/projects/${projectId}/traces/${traceId}/tags` : null,
    swrFetcher
  );

  const tags: TagType[] = useMemo(
    () =>
      rawTags.map((name) => ({
        id: name,
        name,
        color: tagClasses.find((c) => c.name === name)?.color,
      })),
    [rawTags, tagClasses]
  );

  const onAttach = async (tagClassName: string) => {
    try {
      await mutateTags(
        async () => {
          const res = await fetch(`/api/projects/${projectId}/traces/${traceId}/tags`, {
            method: "POST",
            body: JSON.stringify({ tagName: tagClassName }),
          });
          if (!res.ok) {
            const errMessage = await res
              .json()
              .then((d) => d?.error)
              .catch(() => null);
            throw new Error(errMessage ?? "Failed to attach tag");
          }
          return [...rawTags, tagClassName];
        },
        {
          optimisticData: [...rawTags, tagClassName],
          rollbackOnError: true,
          revalidate: false,
        }
      );
    } catch (e) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Something went wrong" });
    }
  };

  const onDetach = async (tag: TagType) => {
    try {
      await mutateTags(
        async () => {
          const res = await fetch(`/api/projects/${projectId}/traces/${traceId}/tags/${encodeURIComponent(tag.name)}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const errMessage = await res
              .json()
              .then((d) => d?.error)
              .catch(() => null);
            throw new Error(errMessage ?? "Failed to delete tag");
          }
          return rawTags.filter((n) => n !== tag.name);
        },
        {
          optimisticData: rawTags.filter((n) => n !== tag.name),
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

      await mutateTags(
        async () => {
          const res = await fetch(`/api/projects/${projectId}/traces/${traceId}/tags`, {
            method: "POST",
            body: JSON.stringify({ tagName: name }),
          });
          if (!res.ok) {
            const errMessage = await res
              .json()
              .then((d) => d?.error)
              .catch(() => null);
            throw new Error(errMessage ?? "Failed to attach tag");
          }
          return [...rawTags, name];
        },
        {
          optimisticData: [...rawTags, name],
          rollbackOnError: true,
          revalidate: false,
        }
      );
    } catch (e) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Something went wrong" });
    }
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
              {tags.slice(0, 5).map((tag) => (
                <div
                  key={tag.id}
                  className={cn("size-3.5 border border-background rounded-full", !tag.color && "bg-gray-300")}
                  style={tag.color ? { background: tag.color } : undefined}
                />
              ))}
              {tags.length > 5 && (
                <div className="size-3.5 border border-border rounded-full bg-muted flex items-center justify-center">
                  <Plus className="size-2" />
                </div>
              )}
            </div>
          ) : (
            <Tag className="size-3.5" />
          )}
          {tags.length === 0 ? "Tags" : tags.length === 1 ? tags[0].name : `Tags (${tags.length})`}
        </Button>
      </DropdownMenuTrigger>
    </TagsDropdown>
  );
};

export default TraceTagsButton;
