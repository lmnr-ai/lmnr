import { scaleTime } from "d3-scale";
import { differenceInMinutes, format, isValid } from "date-fns";

import { numberFormatter } from "./format";

export const parseUtcTimestamp = (s: string): Date => {
  // Same as before for ClickHouse (no offset → pin Z) and ISO. Postgres
  // timestamptz is "+00"; Date only accepts that as "+00:00". Applied only
  // after a "T" so a date's trailing "-04" is not treated as an offset.
  let t = s.replace(" ", "T");
  if (t.includes("T")) t = t.replace(/([+-]\d{2})$/, "$1:00");
  const hasTimezone = /Z$|[+-]\d{2}:\d{2}$/.test(t);
  if (t.includes("T") && !hasTimezone) return new Date(`${t}Z`);
  return new Date(t);
};

const tryFormatAsDate = (value: string | number | Date, formatPattern: string = "M/dd"): string => {
  try {
    const date =
      value instanceof Date
        ? value
        : typeof value === "string"
          ? parseUtcTimestamp(value)
          : typeof value === "number"
            ? new Date(value)
            : null;

    return date && isValid(date) ? format(date, formatPattern) : String(value);
  } catch {
    return String(value);
  }
};

const getOptimalDateFormat = (data: Record<string, unknown>[], dataKey: string): string => {
  try {
    const dates = data
      .map((row) => {
        try {
          const value = row[dataKey];
          if (typeof value === "string") {
            return parseUtcTimestamp(value);
          }
          return new Date(value as string | number | Date);
        } catch {
          return null;
        }
      })
      .filter((date) => date && isValid(date)) as Date[];

    if (dates.length < 2) return "M/dd HH:mm";

    const sortedDates = dates.sort((a, b) => a.getTime() - b.getTime());

    const timeDifferences = sortedDates.slice(1).map((date, index) => date.getTime() - sortedDates[index].getTime());

    const medianDiff = timeDifferences.sort((a, b) => a - b)[Math.floor(timeDifferences.length / 2)];

    const medianDiffHours = medianDiff / (1000 * 60 * 60);
    const totalSpanHours =
      (sortedDates[sortedDates.length - 1].getTime() - sortedDates[0].getTime()) / (1000 * 60 * 60);

    if (medianDiffHours > 6) {
      return "M/dd";
    }
    // If data points are close together but span more than a day, show both date and time
    if (totalSpanHours > 24) {
      return "M/dd HH:mm";
    }
    return "HH:mm";
  } catch {
    return "M/dd";
  }
};

export const createAxisFormatter = (data: Record<string, unknown>[], dataKey: string) => {
  const dateFormat = getOptimalDateFormat(data, dataKey);

  return (value: string | number | Date) => {
    if (typeof value === "number") {
      return numberFormatter.format(value);
    }

    if (typeof value === "string" || value instanceof Date) {
      const dateFormatted = tryFormatAsDate(value, dateFormat);
      if (dateFormatted !== value) {
        return dateFormatted;
      }
    }

    return String(value);
  };
};

export const selectNiceTicksFromData = (
  dataTimestamps: string[],
  targetTickCount: number = 8
): { ticks: string[]; formatter: (value: string) => string } | null => {
  if (dataTimestamps.length === 0) return null;

  const startDate = parseUtcTimestamp(dataTimestamps[0]);
  const endDate = parseUtcTimestamp(dataTimestamps[dataTimestamps.length - 1]);

  if (!isValid(startDate) || !isValid(endDate)) return null;

  const scale = scaleTime().domain([startDate, endDate]);
  const idealTicks = scale.ticks(targetTickCount);
  const formatTick = scale.tickFormat();

  const findClosestTimestamp = (targetTime: number) =>
    dataTimestamps.reduce((closest, current) => {
      const closestDiff = Math.abs(parseUtcTimestamp(closest).getTime() - targetTime);
      const currentDiff = Math.abs(parseUtcTimestamp(current).getTime() - targetTime);
      return currentDiff < closestDiff ? current : closest;
    });

  const tickLabels = new Map(idealTicks.map((tick) => [findClosestTimestamp(tick.getTime()), formatTick(tick)]));

  return {
    ticks: Array.from(tickLabels.keys()),
    formatter: (value: string) => tickLabels.get(value) || value,
  };
};

// `new Date` accepts strings like "gpt-4", so only ISO-looking values count as timestamps.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export const isTimeAxis = (values: string[]) => values.length > 0 && values.every((value) => ISO_DATE.test(value));

const tooltipTimestampFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
});

/** The time-series tooltip label, e.g. "Mon, Oct 26, 6:00 PM"; unparseable values pass through. */
export const formatTooltipTimestamp = (timestamp: string): string => {
  const date = parseUtcTimestamp(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : tooltipTimestampFormatter.format(date);
};

export const normalizeTimeRange = (left: string, right: string) => {
  const leftTime = parseUtcTimestamp(left).getTime();
  const rightTime = parseUtcTimestamp(right).getTime();

  return leftTime > rightTime
    ? { start: right, end: left, startTime: rightTime, endTime: leftTime }
    : { start: left, end: right, startTime: leftTime, endTime: rightTime };
};

export const isValidZoomRange = (left: string | undefined, right: string | undefined, minMinutes: number = 5) => {
  if (!left || !right || left === right) return false;

  const normalized = normalizeTimeRange(left, right);
  const diffMinutes = differenceInMinutes(normalized.endTime, normalized.startTime);
  return diffMinutes >= minMinutes;
};
