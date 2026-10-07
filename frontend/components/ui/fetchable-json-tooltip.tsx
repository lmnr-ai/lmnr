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
 * Measures in code points, the unit the `substringUTF8(col, 1, 200)` projections that feed
 * these cells truncate by. JS `.length` counts UTF-16 units, so an astral character pushes a
 * fully-truncated prefix past the threshold; `.length` is an upper bound on code points, which
 * is what makes it a sound cheap screen.
 */
const isAtLeastCodePoints = (value: string, n: number) => value.length >= n && [...value].length >= n;

/**
 * A wrapper around JsonTooltip that fetches full data on hover when the
 * displayed value appears truncated (TRUNCATION_THRESHOLD code points).
 *
 * Reusable across evaluation and dataset tables — callers only need to
 * supply the onFetchFull callback.
 */
const FetchableJsonTooltip = ({ data, columnSize, className, onFetchFull }: FetchableJsonTooltipProps) => {
  const valueStr = typeof data === "string" ? data : JSON.stringify(data);
  const isTruncated = !!(onFetchFull && valueStr && isAtLeastCodePoints(valueStr, TRUNCATION_THRESHOLD));

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
