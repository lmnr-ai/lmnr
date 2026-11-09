"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";

import { swrFetcher } from "@/lib/api/fetch-api";
import { swrKeys } from "@/lib/api/swr-keys";

import TagsCell from "./tags-cell";

interface TraceTagsCellProps {
  traceId: string;
}

const TraceTagsCell = ({ traceId }: TraceTagsCellProps) => {
  const { projectId } = useParams();
  const { data: tags = [] } = useSWR<string[]>(
    traceId ? swrKeys.traceTags(String(projectId), traceId) : null,
    swrFetcher,
    { revalidateIfStale: false }
  );

  if (tags.length === 0) return "-";

  return <TagsCell tags={tags} />;
};

export default TraceTagsCell;
