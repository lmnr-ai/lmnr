import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { type GroupByInterval } from "@/lib/clickhouse/modifiers";
import { convertToTimeParameters, type TimeInput, type TimeParameters } from "@/lib/time";

const TIME_RANGE_PARAMS = ["pastHours", "startDate", "endDate", "groupByInterval"] as const;

export type DashboardTimeRange = TimeInput & { groupByInterval?: GroupByInterval };

/** The dashboard's time range from the URL, defaulting to the last 24 hours. */
export const useDashboardTimeRange = (): DashboardTimeRange => {
  const searchParams = useSearchParams();
  const pastHours = searchParams.get("pastHours");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const groupByInterval = searchParams.get("groupByInterval") as GroupByInterval | null;

  return useMemo(() => {
    const interval = groupByInterval ? { groupByInterval } : {};
    if (pastHours) return { pastHours, ...interval };
    if (startDate && endDate) return { startTime: startDate, endTime: endDate, ...interval };
    return { pastHours: 24, ...interval };
  }, [pastHours, startDate, endDate, groupByInterval]);
};

/** Query parameters for the range. Resolved per call, so a relative range ends at the current time. */
export const toTimeParameters = ({ groupByInterval, ...range }: DashboardTimeRange): TimeParameters =>
  convertToTimeParameters(range, groupByInterval);

/** Appends the current page's time range to `href`, so moving between dashboard and editor keeps it. */
export const useWithTimeRange = () => {
  const searchParams = useSearchParams();

  return useCallback(
    (href: string) => {
      const [path, query] = href.split("?");
      const params = new URLSearchParams(query);
      for (const key of TIME_RANGE_PARAMS) {
        const value = searchParams.get(key);
        if (value) params.set(key, value);
      }
      const search = params.toString();
      return search ? `${path}?${search}` : path;
    },
    [searchParams]
  );
};
