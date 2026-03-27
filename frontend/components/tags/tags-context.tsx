"use client";

import { useParams } from "next/navigation";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo } from "react";
import useSWR, { type KeyedMutator } from "swr";

import { type SpanTag, type TagClass } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

export type TagsMode = { type: "span"; spanId: string } | { type: "trace"; traceId: string };

type TagsContextType = {
  mutate: KeyedMutator<SpanTag[]>;
  mutateTagClass: KeyedMutator<TagClass[]>;
  tags: SpanTag[];
  tagClasses: TagClass[];
  isLoading: boolean;
  mode: TagsMode;
};

const TagsContext = createContext<TagsContextType>({
  mutate: () => Promise.resolve(undefined),
  mutateTagClass: () => Promise.resolve(undefined),
  tags: [],
  tagClasses: [],
  isLoading: false,
  mode: { type: "span", spanId: "" },
});

export const useTagsContext = () => useContext(TagsContext);

const TagsContextProvider = ({ children, mode }: PropsWithChildren<{ mode: TagsMode }>) => {
  const params = useParams();
  const projectId = params?.projectId;

  const {
    data: tagClasses = [],
    mutate: mutateTagClass,
    isLoading: isTagsLoading,
  } = useSWR<TagClass[]>(`/api/projects/${projectId}/tag-classes`, swrFetcher);

  // Build fetch URL based on mode
  const tagsUrl = useMemo(() => {
    if (mode.type === "span") {
      return mode.spanId ? `/api/projects/${projectId}/spans/${mode.spanId}/tags` : null;
    }
    return mode.traceId ? `/api/projects/${projectId}/traces/${mode.traceId}/tags` : null;
  }, [mode, projectId]);

  const { data: rawTags, isLoading: isRawLoading, mutate } = useSWR<SpanTag[] | string[]>(tagsUrl, swrFetcher);

  // Normalize tags: for spans, rawTags is SpanTag[]; for traces, rawTags is string[]
  const tags: SpanTag[] = useMemo(() => {
    if (!rawTags) return [];
    if (mode.type === "span") {
      return rawTags as SpanTag[];
    }
    // Trace mode: rawTags is string[], enrich with tag class colors
    return (rawTags as string[]).map((name) => {
      const tc = tagClasses.find((c) => c.name === name);
      return {
        id: name, // traces don't have a tag ID; use name as key
        name,
        spanId: "",
        createdAt: "",
        color: tc?.color,
      };
    });
  }, [rawTags, mode.type, tagClasses]);

  // Re-type the mutate function to match SpanTag[]
  const typedMutate = mutate as unknown as KeyedMutator<SpanTag[]>;

  const createNewTagClasses = useCallback(async () => {
    if (mode.type !== "span") return; // Only auto-create tag classes for span tags
    const tagClassNames = new Set(tagClasses.map((tc) => tc.name));
    const newTags = tags.filter((tag) => !tagClassNames.has(tag.name));
    try {
      for (const tag of newTags) {
        const res = await fetch(`/api/projects/${projectId}/tag-classes/${tag.name}`, {
          method: "POST",
          body: JSON.stringify({
            color: tag.color,
          }),
        });
        if (!res.ok) {
          console.error(`Failed to create tag class "${tag.name}"`);
        }
      }
    } catch (e) {
      console.error("Error creating tag classes:", e);
    }
    if (newTags.length > 0) {
      mutateTagClass();
    }
  }, [tags, tagClasses, projectId, mutateTagClass, mode.type]);

  useEffect(() => {
    // Backend now simply inserts tags to `spans` and `tags` tables, so we create
    // new tag classes from the tags, if those classes don't exist yet.
    createNewTagClasses();
  }, [tags, createNewTagClasses]);

  const value = useMemo<TagsContextType>(
    () => ({
      isLoading: isRawLoading || isTagsLoading,
      mutate: typedMutate,
      mutateTagClass,
      tags,
      tagClasses,
      mode,
    }),
    [tags, isTagsLoading, isRawLoading, tagClasses, typedMutate, mutateTagClass, mode]
  );
  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
};

export default TagsContextProvider;
