"use client";

import TagsCell from "./tags-cell";
import { useTraceTagNames } from "./use-trace-tag-names";

interface TraceTagsCellProps {
  traceId: string;
}

const TraceTagsCell = ({ traceId }: TraceTagsCellProps) => {
  const { data: tags = [] } = useTraceTagNames(traceId);

  if (tags.length === 0) return "-";

  return <TagsCell tags={tags} />;
};

export default TraceTagsCell;
