export type AbsoluteTimeRange = {
  start: Date;
  end: Date;
};

type RelativeTimeRange = {
  pastHours: number;
};

export type TimeRange = AbsoluteTimeRange | RelativeTimeRange;

/**
 * Parse URL/form params into a TimeRange.
 * Returns undefined when no valid params are provided — callers should
 * simply skip the time filter in that case.
 *
 * pastHours takes precedence over startDate/endDate.
 */
export const getTimeRange = (
  pastHours: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined
): TimeRange | undefined => {
  if (pastHours) {
    const parsed = parseInt(pastHours);
    if (!isNaN(parsed) && parsed > 0) {
      return { pastHours: parsed };
    }
  }
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      return { start, end };
    }
  }
  return undefined;
};
