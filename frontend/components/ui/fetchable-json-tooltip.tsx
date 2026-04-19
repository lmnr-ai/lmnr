"use client";

import { useCallback } from "react";

import JsonTooltip from "@/components/ui/json-tooltip";

const TRUNCATION_THRESHOLD = 200;

interface FetchableJsonTooltipProps {
  data: unknown;
  columnSize?: number;
  className?: string;
  /** Called to fetch the full (un-truncated) value. Return the resolved value. */
  onFetchFull?: () => Promise<unknown>;
}

/**
 * A wrapper around JsonTooltip that fetches full data on hover when the
 * displayed value appears truncated (length === TRUNCATION_THRESHOLD).
 *
 * Reusable across evaluation and dataset tables — callers only need to
 * supply the onFetchFull callback.
 */
const FetchableJsonTooltip = ({ data, columnSize, className, onFetchFull }: FetchableJsonTooltipProps) => {
  const valueStr = typeof data === "string" ? data : JSON.stringify(data);
  const isTruncated = !!(onFetchFull && valueStr?.length === TRUNCATION_THRESHOLD);

  const stableOnFetchFull = useCallback(async () => {
    if (!onFetchFull) return null;
    return onFetchFull();
  }, [onFetchFull]);

  return (
    <JsonTooltip
      data={data}
      columnSize={columnSize}
      className={className}
      onOpen={isTruncated ? stableOnFetchFull : undefined}
    />
  );
};

export default FetchableJsonTooltip;
