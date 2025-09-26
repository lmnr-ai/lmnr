"use client";

import { useParams } from "next/navigation";
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo } from "react";
import useSWR, { KeyedMutator } from "swr";

import { SpanTag, TagClass } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

type TagsContextType = {
  mutate: KeyedMutator<SpanTag[]>;
  mutateTagClass: KeyedMutator<TagClass[]>;
  tags: SpanTag[];
  tagClasses: TagClass[];
  isLoading: boolean;
  spanId: string;
};

const TagsContext = createContext<TagsContextType>({
  mutate: () => Promise.resolve(undefined),
  mutateTagClass: () => Promise.resolve(undefined),
  tags: [],
  tagClasses: [],
  isLoading: false,
  spanId: "",
});

export const useTagsContext = () => useContext(TagsContext);

const TagsContextProvider = ({ children, spanId }: PropsWithChildren<{ spanId: string }>) => {
  const params = useParams();
  const {
    data: tagClasses = [],
    mutate: mutateTagClass,
    isLoading: isTagsLoading,
  } = useSWR<TagClass[]>(`/api/projects/${params?.projectId}/tag-classes`, swrFetcher);
  const {
    data: tags = [],
    isLoading,
    mutate,
  } = useSWR<SpanTag[]>(spanId ? `/api/projects/${params?.projectId}/spans/${spanId}/tags` : null, swrFetcher);

  const createNewTagClasses = useCallback(async () => {
    const tagClassNames = new Set(tagClasses.map((tc) => tc.name));
    const newTags = tags.filter((tag) => !tagClassNames.has(tag.name));
    for (const tag of newTags) {
      await fetch(`/api/projects/${params?.projectId}/tag-classes/${tag.name}`, {
        method: "POST",
        body: JSON.stringify({
          color: tag.color,
        }),
      });
    }
    if (newTags.length > 0) {
      mutateTagClass();
    }
  }, [tags, tagClasses, params?.projectId]);

  useEffect(() => {
    // Backend now simply inserts tags to `spans` and `tags` tables, so we create
    // new tag classes from the tags, if those classes don't exist yet.
    createNewTagClasses();
  }, [tags, createNewTagClasses]);


  const value = useMemo<TagsContextType>(
    () => ({
      isLoading: isLoading || isTagsLoading,
      mutate,
      mutateTagClass,
      tags,
      tagClasses,
      spanId,
    }),
    [tags, isTagsLoading, isLoading, tagClasses, mutate, mutateTagClass, spanId]
  );
  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
};

export default TagsContextProvider;
