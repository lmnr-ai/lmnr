import { useSearchParams } from "next/navigation";
import { type RefObject, useEffect, useState } from "react";

import { calculateOptimalInterval, getTargetBarsForWidth } from "@/components/traces/traces-chart/utils";

import { DEFAULT_PAST_HOURS } from "./utils";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Query string for the versions endpoint: the URL's time range (default last 30 days)
 * plus a bucket interval sized to the container, like the traces chart, so bars stay
 * a similar width at any range.
 */
export function useTracesRangeQuery(containerRef: RefObject<HTMLElement | null>): string {
  const searchParams = useSearchParams();
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef]);

  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours") ?? (startDate && endDate ? null : DEFAULT_PAST_HOURS);

  const query = new URLSearchParams();
  let from: Date;
  let to: Date;
  if (pastHours) {
    query.set("pastHours", pastHours);
    to = new Date();
    from = new Date(to.getTime() - Number(pastHours) * HOUR_MS);
  } else {
    query.set("startDate", startDate!);
    query.set("endDate", endDate!);
    from = new Date(startDate!);
    to = new Date(endDate!);
  }

  const interval = calculateOptimalInterval(from, to, width ? getTargetBarsForWidth(width) : 48);
  query.set("intervalValue", String(interval.value));
  query.set("intervalUnit", interval.unit);
  return query.toString();
}
