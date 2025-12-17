import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

import { GroupByInterval } from "./clickhouse/modifiers";

export const TIME_MILLISECONDS_FORMAT = "timeMilliseconds";
export const TIME_SECONDS_FORMAT = "timeSeconds";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function fetcherRealTime(url: string, init: any): Promise<Response> {
  const res = await fetch(`${process.env.BACKEND_RT_URL}/api/v1${url}`, {
    ...init,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();

    throw new Error(text);
  }

  return res;
}

export async function fetcherJSON<JSON = any>(url: string, init: any): Promise<JSON> {
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1${url}`, {
    ...init,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return (await res.json()) as JSON;
}

export const swrFetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const errorText = (await res.json()) as { error: string };
    throw new Error(errorText.error);
  }

  return res.json();
};

// return string such as 0319 for March 19 or 1201 for December 1
// Note that the date is calculated for local time
export function getCurrentMonthDayStr() {
  const date = new Date();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month < 10) {
    if (day < 10) {
      return `0${month}0${day}`;
    }
    return `0${month}${day}`;
  }
  if (day < 10) {
    return `${month}0${day}`;
  }
  return `${month}${day}`;
}

export function formatDate(input: string | number | Date): string {
  const date = new Date(input);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export const formatUTCDate = (date: string) => {
  const timeZoneOffset = new Date().getTimezoneOffset();
  return new Date(new Date(date).getTime() + timeZoneOffset * 60000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

// E.g. 2024-09-04T20:18:58.330355+00:00 -> 13:18:58.330
export function convertToLocalTimeWithMillis(isoDateString: string): string {
  const date = new Date(isoDateString);

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

export function formatTimestamp(timestampStr: string): string {
  const date = new Date(timestampStr);
  return innerFormatTimestamp(date);
}

export function formatTimestampWithSeconds(timestampStr: string): string {
  const date = new Date(timestampStr);
  return innerFormatTimestamp(date, TIME_SECONDS_FORMAT);
}

export function formatTimestampFromSeconds(seconds: number): string {
  const date = new Date(seconds * 1000);
  return innerFormatTimestamp(date);
}

export function formatTimestampWithInterval(timestampStr: string, interval: GroupByInterval): string {
  const date = new Date(`${timestampStr}Z`);
  return innerFormatTimestampWithInterval(date, interval);
}

export function formatTimestampFromSecondsWithInterval(seconds: number, interval: GroupByInterval): string {
  const date = new Date(seconds * 1000);
  return innerFormatTimestampWithInterval(date, interval);
}

function innerFormatTimestampWithInterval(date: Date, interval: GroupByInterval): string {
  if (interval === GroupByInterval.Day) {
    return date.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "numeric",
    });
  } else if (interval === GroupByInterval.Hour) {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } else {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
}

// Note that the formatted time is calculated for local time
function innerFormatTimestamp(date: Date, format?: string): string {
  const timeOptions: Intl.DateTimeFormatOptions = {
    ...(format === TIME_SECONDS_FORMAT ? { second: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const dateOptions: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "short",
  };

  const timeStr = date.toLocaleString("en-US", timeOptions).replace(/^24:/, "00:");
  const dateStr = date.toLocaleString("en-US", dateOptions);

  // TODO: Add year, if it's not equal to current year

  return `${dateStr}, ${timeStr}`;
}

export function deep<T>(value: T): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return deepArray(value);
  }
  return deepObject(value);
}

function deepObject<T extends {}>(source: T) {
  const result = {} as T;
  Object.keys(source).forEach((key) => {
    const value = source[key as keyof T];
    result[key as keyof T] = deep(value);
  }, {});
  return result as T;
}

function deepArray<T extends any[]>(collection: T): any {
  return collection.map((value) => deep(value));
}

export const getGroupByInterval = (
  pastHours: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  defaultGroupByInterval: string | undefined
): string => {
  let groupByInterval = "hour";
  // If explicitly specified in the URL, then use it
  if (defaultGroupByInterval != undefined) {
    return defaultGroupByInterval;
  }
  if (pastHours === "1") {
    groupByInterval = "minute";
  } else if (pastHours === "7") {
    groupByInterval = "minute";
  } else if (pastHours === "24") {
    groupByInterval = "hour";
  } else if (parseInt(pastHours ?? "0") > 24) {
    groupByInterval = "day";
  } else if (pastHours === "all") {
    groupByInterval = "day";
  } else if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = end.getTime() - start.getTime();
    if (diff > 48 * 60 * 60 * 1000) {
      // 2 days
      groupByInterval = "day";
    } else if (diff < 6 * 60 * 60 * 1000) {
      // 6 hours
      groupByInterval = "minute";
    }
  }
  return groupByInterval;
};

export const isGroupByIntervalAvailable = (
  pastHours: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  interval: string | undefined
): boolean => {
  const minutes = pastHours
    ? parseInt(pastHours) * 60
    : startDate && endDate
      ? Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / 60000)
      : 0;
  if (interval === "minute") {
    return minutes <= 12 * 60;
  }
  if (interval === "hour") {
    return minutes <= 31 * 24 * 60;
  }
  if (interval === "day") {
    return true;
  }
  return false;
};

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 3,
});

export const toFixedIfFloat = (value: number) => {
  if (value % 1 === 0) {
    // For integers, show with thousand separators
    return numberFormatter.format(value);
  } else {
    // For decimals, format with up to 3 decimal places and thousand separators
    return numberFormatter.format(parseFloat(value.toFixed(3)));
  }
};

export const isValidJsonObject = (value: any): boolean =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const formatSecondsToMinutesAndSeconds = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

export const pluralize = (count: number, singular: string, plural: string) => {
  const pluralRules = new Intl.PluralRules("en-US");
  const grammaticalNumber = pluralRules.select(count);
  switch (grammaticalNumber) {
    case "one":
      return `${count} ${singular}`;
    default:
      return `${count} ${plural}`;
  }
};

export const isValidNumber = (value?: number): value is number => typeof value === "number" && !isNaN(value);

export function generateRandomKey(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);

  return Array.from(randomValues)
    .map((value) => chars[value % chars.length])
    .join("");
}

export const inferImageType = (base64: string): `image/${string}` | null => {
  if (base64.startsWith("/9j/")) {
    return "image/jpeg";
  } else if (base64.startsWith("iVBORw0KGgo")) {
    return "image/png";
  } else if (base64.startsWith("R0lGODlh")) {
    return "image/gif";
  } else if (base64.startsWith("UklGR")) {
    return "image/webp";
  } else if (base64.startsWith("PHN2Zz")) {
    return "image/svg+xml";
  }
  return null;
};
export const getDurationString = (startTime: string, endTime: string) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const duration = end.getTime() - start.getTime();

  return `${(duration / 1000).toFixed(2)}s`;
};

export const getDuration = (startTime: string, endTime: string) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return Math.max(end.getTime() - start.getTime(), 0);
};

export const tryParseJson = (value: string) => {
  if (value === "" || value === undefined) return null;

  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
};

export const generateUuid = (): string => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return uuidv4();
  }
};

export const generateSequentialUuidsV7 = (count: number = 1): string[] => {
  if (count <= 0) {
    return [];
  }

  // From uuid library docs:
  // 32-bit sequence Number between 0 - 0xffffffff.
  // This may be provided to help ensure uniqueness for UUIDs generated within the same millisecond time interval.
  // Default = random value.

  // UUID v7 has 12 + 62 random bits, and seq seems to map the 74 bits space to
  // 2^32 sequential spaces, within each of which the rest is random.

  // Most often, this will result in IDs that have 7000-800 in the middle,
  // but that is ok.
  return Array.from({ length: count }, (_, i) => uuidv7({ seq: i }));
};
