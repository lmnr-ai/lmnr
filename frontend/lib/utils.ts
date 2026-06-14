import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { v4 as uuidv4, v7 as uuidv7 } from "uuid";

import { GroupByInterval } from "./clickhouse/modifiers";

export const TIME_MILLISECONDS_FORMAT = "timeMilliseconds";
export const TIME_SECONDS_FORMAT = "timeSeconds";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Sub-path the app is served under, baked in at build time (see next.config.ts).
// Next auto-prefixes <Link>/router/redirect/next-image/assets, but NOT runtime
// native fetch, EventSource, window.location.*, or Better Auth callbackURLs —
// those must call withBasePath explicitly. Empty string when root-served, so all
// helpers below are no-ops in the regular frontend-ee image.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

// Prefix a root-relative app path with BASE_PATH. Absolute URLs (http(s)://,
// //host) and non-root values are returned unchanged so external calls
// (PostHog/Sentry) and already-prefixed paths are never double-stamped.
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (!path.startsWith("/")) return path;
  if (path.startsWith("//")) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}

// Inverse of withBasePath: strip the baked prefix off a browser-observed path
// (window.location.pathname carries it) so the result can be fed back into
// anything that re-prefixes — router.push and Better Auth callbackURLs both add
// BASE_PATH themselves, so storing a prefix-inclusive value would double-stamp.
export function stripBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (path === BASE_PATH) return "/";
  if (path.startsWith(`${BASE_PATH}/`)) return path.slice(BASE_PATH.length);
  return path;
}

// Constrain a post-auth `callbackUrl` (read from the query string) to a
// same-origin relative path before it reaches `router.push`, preventing an
// open redirect to an attacker-controlled site. Anything that resolves off our
// origin falls back to `defaultUrl`.
export function sanitizeCallbackUrl(raw: string | string[] | undefined, defaultUrl = "/onboarding"): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return defaultUrl;
  try {
    // Parse against a placeholder base (works server-side — no `window`). A
    // relative path keeps this origin; absolute / protocol-relative (`//host`)
    // / backslash (`/\host`) targets resolve to a different origin and are
    // rejected. The URL parser also strips tab/newline/CR per the WHATWG spec,
    // so no manual sanitising is needed. https base => backslashes normalise to
    // slashes, matching browser behaviour.
    const base = "https://placeholder.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return defaultUrl;
    // Enforce the prefix-free callbackUrl contract at the boundary: consumers
    // (router.push, OAuth callbackURL) re-apply BASE_PATH, so an inbound value
    // that already carries the prefix (stale link / hand-crafted query) would
    // otherwise double-stamp to `/lmnr/lmnr/...`.
    const path = stripBasePath(url.pathname) + url.search + url.hash;
    return path === "/" ? defaultUrl : path;
  } catch {
    return defaultUrl;
  }
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

// Thrown when an API call is rejected for a missing/expired session (proxy.ts
// returns `{ code: "UNAUTHENTICATED" }` with a 401). Kept distinct from generic
// errors so callers can recognise an auth failure if they need to.
export class UnauthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
    this.name = "UnauthenticatedError";
  }
}

// Module-scoped single-flight guard: a burst of concurrent SWR failures (a
// dashboard firing many hooks at once) triggers exactly one redirect per tab.
let isRedirectingToSignIn = false;

// Force the browser to the sign-in page, preserving where the user was. Triggered
// straight from swrFetcher at the moment a 401 is detected, so re-auth does NOT
// depend on SWRConfig.onError — which any hook can override with its own onError.
// `window.location.assign` is a browser API (no React router/context needed); a
// hard navigation is intentional so middleware re-runs and stale client state is
// dropped. Guarded on `window` because this module is also imported server-side.
const redirectToSignIn = () => {
  if (typeof window === "undefined") return;
  if (isRedirectingToSignIn) return;
  // Loop guard: never bounce a request that originated on the sign-in page.
  // pathname carries BASE_PATH under a sub-path deploy, so compare against the
  // prefixed form.
  if (window.location.pathname.startsWith(withBasePath("/sign-in"))) return;
  isRedirectingToSignIn = true;
  // callbackUrl must be prefix-free: the sign-in page re-prefixes it (router.push
  // auto-adds BASE_PATH), so strip the prefix off the observed pathname first.
  const callbackUrl = encodeURIComponent(stripBasePath(window.location.pathname) + window.location.search);
  window.location.assign(withBasePath(`/sign-in?callbackUrl=${callbackUrl}`));
  // A successful navigation tears this module down, so this timer only fires if
  // the navigation was blocked (e.g. a beforeunload prompt the user cancels) —
  // release the guard so a later 401 can retry instead of no-opping forever.
  window.setTimeout(() => {
    isRedirectingToSignIn = false;
  }, 10_000);
};

export const swrFetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    // Parse once, tolerating a non-JSON error body.
    const body = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    if (res.status === 401 && body?.code === "UNAUTHENTICATED") {
      // Redirect at the detection point so it fires regardless of whether the
      // calling hook supplied its own onError. Still throw so the hook's
      // loading/error state settles before the navigation completes.
      redirectToSignIn();
      throw new UnauthenticatedError();
    }
    throw new Error(body?.error ?? "Request failed");
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

export function formatShortDate(input: string | number | Date): string {
  const date = new Date(input);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
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

/** Format a duration in ms as a short human-readable string (e.g. "3m 12s").
 *  Returns null for zero/negative/invalid durations. */
export function formatDuration(ms: number | undefined): string | null {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return null;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 1) return "<1s";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const s = seconds % 60;
    return s === 0 ? `${minutes}m` : `${minutes}m ${s}s`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const m = minutes % 60;
    return m === 0 ? `${hours}h` : `${hours}h ${m}m`;
  }
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h === 0 ? `${days}d` : `${days}d ${h}h`;
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

function deepObject<T extends object>(source: T) {
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
  } else if (parseInt(pastHours ?? "0") > 24 * 7) {
    groupByInterval = "day";
  } else if (pastHours === "all") {
    groupByInterval = "day";
  } else if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diff = end.getTime() - start.getTime();
    if (diff > 7 * 24 * 60 * 60 * 1000) {
      // 1 week
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

export const formatSecsToHoursMinsSecs = (seconds: number): string => {
  let h = Math.floor(seconds / 3600);
  let m = Math.floor((seconds % 3600) / 60);
  let s = seconds % 60;

  const precision = s < 1 ? 2 : 1;
  const rounded = parseFloat(s.toFixed(precision));
  if (rounded >= 60) {
    s = 0;
    m += 1;
    if (m >= 60) {
      m = 0;
      h += 1;
    }
  } else {
    s = rounded;
  }

  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (parts.length === 0 || s > 0) {
    parts.push(`${s < 10 && parts.length > 0 ? s.toFixed(1) : s.toFixed(s < 1 ? 2 : 1)}s`);
  }
  return parts.join(" ");
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

// Convert URL-safe base64 (RFC 4648 §5) to standard base64 for data URIs.
export const toStandardBase64 = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/");

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
export function formatTimeRange(start: Date, end: Date): string {
  const sameDay = start.toDateString() === end.toDateString();

  const startHours = start.getHours();
  const startMinutes = String(start.getMinutes()).padStart(2, "0");
  const startAmPm = startHours >= 12 ? "PM" : "AM";
  const startH = startHours % 12 || 12;
  const startTimeStr = `${startH}:${startMinutes} ${startAmPm}`;

  const endHours = end.getHours();
  const endMinutes = String(end.getMinutes()).padStart(2, "0");
  const endAmPm = endHours >= 12 ? "PM" : "AM";
  const endH = endHours % 12 || 12;
  const endTimeStr = `${endH}:${endMinutes} ${endAmPm}`;

  const isToday = start.toDateString() === new Date().toDateString();

  if (isToday && sameDay) {
    return `${startTimeStr} – ${endTimeStr}`;
  }

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const startDateStr = `${months[start.getMonth()]} ${start.getDate()}`;

  if (sameDay) {
    return `${startDateStr}, ${startTimeStr} – ${endTimeStr}`;
  }

  const endDateStr = `${months[end.getMonth()]} ${end.getDate()}`;
  return `${startDateStr}, ${startTimeStr} – ${endDateStr}, ${endTimeStr}`;
}

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
