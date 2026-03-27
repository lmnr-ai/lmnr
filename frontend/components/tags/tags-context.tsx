"use client";

import { useParams } from "next/navigation";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo } from "react";
import useSWR, { type KeyedMutator } from "swr";

import { type SpanTag, type TagClass, type TraceTag } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

type EntityTag = SpanTag | TraceTag;

type TagsContextType = {
  mutate: KeyedMutator<EntityTag[]>;
  mutateTagClass: KeyedMutator<TagClass[]>;
  tags: EntityTag[];
  tagClasses: TagClass[];
  isLoading: boolean;
  mode: "span" | "trace";
  entityId: string;
};

const TagsContext = createContext<TagsContextType>({
  mutate: () => Promise.resolve(undefined),
  mutateTagClass: () => Promise.resolve(undefined),
  tags: [],
  tagClasses: [],
  isLoading: false,
  mode: "span",
  entityId: "",
});

export const useTagsContext = () => useContext(TagsContext);

type TagsContextProviderProps = { spanId: string; traceId?: never } | { traceId: string; spanId?: never };

const TagsContextProvider = ({ children, ...props }: PropsWithChildren<TagsContextProviderProps>) => {
  const mode = "traceId" in props && props.traceId ? "trace" : "span";
  const entityId = mode === "trace" ? props.traceId! : props.spanId!;

  const params = useParams();
  const {
    data: tagClasses = [],
    mutate: mutateTagClass,
    isLoading: isTagsLoading,
  } = useSWR<TagClass[]>(`/api/projects/${params?.projectId}/tag-classes`, swrFetcher);

  const swrUrl = useMemo(() => {
    if (!entityId) return null;
    if (mode === "trace") {
      return `/api/projects/${params?.projectId}/traces/${entityId}/tags`;
    }
    return `/api/projects/${params?.projectId}/spans/${entityId}/tags`;
  }, [mode, entityId, params?.projectId]);

  const { data: tags = [], isLoading, mutate } = useSWR<EntityTag[]>(swrUrl, swrFetcher);

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
  }, [tags, tagClasses, params?.projectId, mutateTagClass]);

  useEffect(() => {
    // Backend now simply inserts tags to `spans` and `span_tags` tables, so we create
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
      mode,
      entityId,
    }),
    [tags, isTagsLoading, isLoading, tagClasses, mutate, mutateTagClass, mode, entityId]
  );
  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
};

export default TagsContextProvider;
