"use client";

import { useParams } from "next/navigation";
import { createContext, PropsWithChildren, useContext, useMemo } from "react";
import useSWR, { KeyedMutator } from "swr";

import { SpanTag,TagClass } from "@/lib/traces/types";
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
    data = [],
    isLoading,
    mutate,
  } = useSWR<SpanTag[]>(spanId ? `/api/projects/${params?.projectId}/spans/${spanId}/tags` : null, swrFetcher);

  const value = useMemo<TagsContextType>(
    () => ({
      isLoading: isLoading || isTagsLoading,
      mutate,
      mutateTagClass,
      tags: data,
      tagClasses,
      spanId,
    }),
    [data, isTagsLoading, isLoading, tagClasses, mutate, mutateTagClass, spanId]
  );
  return <TagsContext.Provider value={value}>{children}</TagsContext.Provider>;
};

export default TagsContextProvider;
