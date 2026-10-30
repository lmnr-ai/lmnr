type AbsoluteTimeRange = {
  start: Date;
  end: Date;
};

type RelativeTimeRange = {
  pastHours: number;
};

export type TimeRange = AbsoluteTimeRange | RelativeTimeRange;

export const getTimeRange = (
  pastHours: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined
): TimeRange => {
  if (pastHours) {
    return { pastHours: parseInt(pastHours) };
  }
  if (startDate && endDate) {
    return { start: new Date(startDate), end: new Date(endDate) };
  }
  throw new Error("Invalid time range");
};

export const getOptionalTimeRange = (
  pastHours: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined
): TimeRange | undefined => {
  if (pastHours) {
    return { pastHours: parseInt(pastHours) };
  }
  if (startDate && endDate) {
    return { start: new Date(startDate), end: new Date(endDate) };
  }
  return undefined;
};
