"use client";

import { useParams } from "next/navigation";
import useSWR from "swr";

import { swrFetcher } from "@/lib/utils";

import TagsCell from "./tags-cell";

interface TraceTagsCellProps {
  traceId: string;
}

const TraceTagsCell = ({ traceId }: TraceTagsCellProps) => {
  const { projectId } = useParams();
  const { data: tags = [] } = useSWR<string[]>(
    traceId ? `/api/projects/${projectId}/traces/${traceId}/tags` : null,
    swrFetcher,
    { revalidateIfStale: false }
  );

  if (tags.length === 0) return "-";

  return <TagsCell tags={tags} />;
};

export default TraceTagsCell;
