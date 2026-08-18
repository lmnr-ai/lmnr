"use client";

import { Tag } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";
import { type TagClass } from "@/lib/traces/types";
import { cn, swrFetcher } from "@/lib/utils";

import { Badge } from "../ui/badge";
import TagsDropdown, { type Tag as TagType } from "./tags-dropdown";

export function useEvaluationTags(evaluationId: string) {
  const { projectId } = useParams();

  const { data: tagClasses = [], mutate: mutateTagClasses } = useSWR<TagClass[]>(
    `/api/projects/${projectId}/tag-classes`,
    swrFetcher
  );

  const { data: rawTags = [], mutate: mutateTags } = useSWR<string[]>(
    evaluationId ? `/api/projects/${projectId}/evaluations/${evaluationId}/tags` : null,
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

  return { projectId, tagClasses, rawTags, tags, mutateTagClasses, mutateTags };
}

interface EvaluationTagsProps {
  evaluationId: string;
  className?: string;
}

const parseError = async (res: Response, fallback: string) => {
  const message = await res
    .json()
    .then((d) => d?.error)
    .catch(() => null);
  return new Error(message ?? fallback);
};

export const EvaluationTagsButton = ({ evaluationId, className }: EvaluationTagsProps) => {
  const { projectId, tagClasses, rawTags, tags, mutateTagClasses, mutateTags } = useEvaluationTags(evaluationId);
  const { toast } = useToast();

  const attach = async (name: string) => {
    await mutateTags(
      async () => {
        const res = await fetch(`/api/projects/${projectId}/evaluations/${evaluationId}/tags`, {
          method: "POST",
          body: JSON.stringify({ tagName: name }),
        });
        if (!res.ok) {
          throw await parseError(res, "Failed to attach tag");
        }
        return (await res.json()) as string[];
      },
      {
        optimisticData: [...rawTags, name],
        rollbackOnError: true,
        revalidate: false,
      }
    );
  };

  const onAttach = async (tagClassName: string) => {
    try {
      await attach(tagClassName);
    } catch (e) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Something went wrong" });
    }
  };

  const onDetach = async (tag: TagType) => {
    try {
      await mutateTags(
        async () => {
          const res = await fetch(
            `/api/projects/${projectId}/evaluations/${evaluationId}/tags/${encodeURIComponent(tag.name)}`,
            { method: "DELETE" }
          );
          if (!res.ok) {
            throw await parseError(res, "Failed to delete tag");
          }
          return (await res.json()) as string[];
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
        throw await parseError(tcRes, "Failed to create tag");
      }
      const newClass = (await tcRes.json()) as TagClass;
      await mutateTagClasses([...tagClasses, newClass], { revalidate: false });

      await attach(name);
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
          <Tag data-icon="inline-start" className="size-3.5" />
          Tags
        </Button>
      </DropdownMenuTrigger>
    </TagsDropdown>
  );
};

export const EvaluationTagsPills = ({ evaluationId }: EvaluationTagsProps) => {
  const { tags } = useEvaluationTags(evaluationId);

  return (
    <>
      {tags.map(({ name, color, id }) => (
        <Badge key={id} variant="outline" className="rounded-full gap-1">
          <div className="rounded-full size-2.5 bg-gray-300" style={{ backgroundColor: color }} />
          {name}
        </Badge>
      ))}
    </>
  );
};
