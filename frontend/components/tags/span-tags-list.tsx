"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import useSWR from "swr";

import { type SpanTag, type TagClass } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

import { Badge } from "../ui/badge";

interface SpanTagsListProps {
  traceId: string;
  spanId: string;
}

// Span tags are set at ingestion time from the SDK; the UI only reads them.
const SpanTagsList = ({ traceId, spanId }: SpanTagsListProps) => {
  const { projectId } = useParams();

  const { data: tagClasses = [] } = useSWR<TagClass[]>(`/api/projects/${projectId}/tag-classes`, swrFetcher);

  const { data: rawTags = [] } = useSWR<SpanTag[]>(
    traceId && spanId ? `/api/projects/${projectId}/traces/${traceId}/spans/${spanId}/tags` : null,
    swrFetcher
  );

  const tags = useMemo(
    () =>
      rawTags.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color ?? tagClasses.find((c) => c.name === t.name)?.color,
      })),
    [rawTags, tagClasses]
  );

  return (
    <>
      {tags.map(({ name, color, id }) => (
        <Badge key={id} variant="outline" className="rounded-full gap-1">
          <div className="rounded-full size-2.5 bg-gray-300" style={color ? { backgroundColor: color } : undefined} />
          {name}
        </Badge>
      ))}
    </>
  );
};

export default SpanTagsList;
