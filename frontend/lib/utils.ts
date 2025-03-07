import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import * as Y from "yjs";

import { GroupByInterval } from "./clickhouse/modifiers";
import { InputVariable, PipelineVisibility } from "./pipeline/types";
import { ChatMessageContentPart, DatatableFilter } from "./types";

export const TIME_MILLISECONDS_FORMAT = "timeMilliseconds";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function fetcher<JSON = any>(url: string, init: any): Promise<Response> {
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1${url}`, {
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

export const swrFetcher = (url: string) =>
  fetch(url)
    .then((res) => res.json())
    .catch((err) => console.error(err));

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
function innerFormatTimestamp(date: Date): string {
  const timeOptions: Intl.DateTimeFormatOptions = {
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

export const getLocalEnvVars = (projectId: string): Record<string, string> =>
  JSON.parse(localStorage?.getItem(`env-${projectId}`) ?? "{}");

export const setLocalEnvVar = (projectId: string, key: string, value: string) => {
  const localEnvVars = getLocalEnvVars(projectId);
  localStorage.setItem(`env-${projectId}`, JSON.stringify({ ...localEnvVars, [key]: value }));
};

export const deleteLocalEnvVar = (projectId: string, key: string) => {
  const localEnvVars = getLocalEnvVars(projectId);
  delete localEnvVars[key];
  localStorage.setItem(`env-${projectId}`, JSON.stringify(localEnvVars));
};

export const getLocalDevSessions = (projectId: string): Record<string, string> =>
  JSON.parse(localStorage?.getItem(`dev-sessions-${projectId}`) ?? "{}");

export const setLocalDevSession = (projectId: string, key: string, value: string) => {
  const localDevSessions = getLocalDevSessions(projectId);
  localStorage.setItem(`dev-sessions-${projectId}`, JSON.stringify({ ...localDevSessions, [key]: value }));
};

export const deleteLocalDevSession = (projectId: string, key: string) => {
  const localDevSessions = getLocalDevSessions(projectId);
  delete localDevSessions[key];
  localStorage.setItem(`dev-sessions-${projectId}`, JSON.stringify(localDevSessions));
};

// If unseen state, then use it to fill out inputs
export const STORED_INPUTS_STATE_UNSEEN = "INPUTS_UNSEEN_STATE";
// If seen state, then use allInputs to fill out inputs
export const STORED_INPUTS_STATE_SEEN = "INPUTS_SEEN_STATE";

export const getStoredInputs = (
  pipelineVersionId: string,
  focusedNodeId: string | null,
  pipelineVisibility: PipelineVisibility = "PRIVATE"
) => {
  const innerKey = focusedNodeId === null ? "pipeline" : `node-${focusedNodeId}`;
  const key = `${pipelineVisibility === "PUBLIC" ? "public-" : ""}pipeline-inputs-${pipelineVersionId}`;
  const localPipelineInputs = JSON.parse(localStorage.getItem(key) ?? "{}");

  if (!localPipelineInputs[innerKey]) {
    return {
      state: STORED_INPUTS_STATE_UNSEEN,
      inputs: [],
    };
  }

  return localPipelineInputs[innerKey];
};

/**
 * Set local pipeline inputs to the UNSEEN_STATE
 */
export const convertAllStoredInputsToUnseen = (
  pipelineVersionId: string,
  pipelineVisibility: PipelineVisibility = "PRIVATE"
) => {
  const inputsKey = `${pipelineVisibility === "PUBLIC" ? "public-" : ""}pipeline-inputs-${pipelineVersionId}`;
  const localPipelineInputs = JSON.parse(localStorage.getItem(inputsKey) ?? "{}");
  const preparedLocalPipelineInputs = Object.keys(localPipelineInputs).reduce(
    (acc, key) => ({
      ...acc,
      [key]: {
        state: STORED_INPUTS_STATE_UNSEEN,
        inputs: localPipelineInputs[key].inputs,
      },
    }),
    {}
  );
  localStorage.setItem(inputsKey, JSON.stringify(preparedLocalPipelineInputs));
};

/**
 * Set local inputs for focusedNodeid to UNSEEN_STATE
 */
export const convertStoredInputToUnseen = (
  pipelineVersionId: string,
  focusedNodeId: string | null,
  pipelineVisibility: PipelineVisibility = "PRIVATE"
) => {
  const innerKey = focusedNodeId === null ? "pipeline" : `node-${focusedNodeId}`;
  const key = `${pipelineVisibility === "PUBLIC" ? "public-" : ""}pipeline-inputs-${pipelineVersionId}`;
  const localPipelineInputs = JSON.parse(localStorage.getItem(key) ?? "{}");

  if (!!localPipelineInputs[innerKey]) {
    localPipelineInputs[innerKey] = {
      ...localPipelineInputs[innerKey],
      state: STORED_INPUTS_STATE_UNSEEN,
    };
    localStorage.setItem(key, JSON.stringify(localPipelineInputs));
  }
};

export const setStoredInputs = (
  pipelineVersionId: string,
  focusedNodeId: string | null,
  inputs: InputVariable[][],
  pipelineVisibility: PipelineVisibility = "PRIVATE"
) => {
  const innerKey = focusedNodeId === null ? "pipeline" : `node-${focusedNodeId}`;
  const key = `${pipelineVisibility === "PUBLIC" ? "public-" : ""}pipeline-inputs-${pipelineVersionId}`;
  const localPipelineInputs = JSON.parse(localStorage.getItem(key) ?? "{}");
  localStorage.setItem(
    key,
    JSON.stringify({
      ...localPipelineInputs,
      [innerKey]: { state: STORED_INPUTS_STATE_SEEN, inputs },
    })
  );
};

/**
 * Simple hash function to generate a short unique (with high-probability) identifier
 *
 * It doesn't use numbers so that in the code-generated nodes there are no numbers in the variables.
 */
export function generateShortHash() {
  const chars = "abcdefghkmnopqrstuxyz0123456789";
  let hash = "";
  for (let i = 0; i < 6; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hash;
}

export const isStringType = (content: string | ChatMessageContentPart[]): content is string =>
  typeof content === "string" || content instanceof String;

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

export function toYjsObject(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    throw new Error(`Unsupported type: ${typeof obj}`);
  }

  const ymap = new Y.Map();

  for (let key of Object.keys(obj)) {
    const value = obj[key];
    if (value === null || value === undefined) {
      ymap.set(key, new Y.Text());
    } else if (typeof value === "string") {
      const ytext = new Y.Text();
      ytext.insert(0, value);
      ymap.set(key, ytext);
    } else {
      ymap.set(key, value);
    }
  }

  return ymap;
}

export const getFilterFromUrlParams = (filter: string): DatatableFilter[] | undefined => {
  const filters = JSON.parse(filter);
  if (Array.isArray(filters)) {
    return filters.filter((f: any) => typeof f === "object" && f.column && f.operator && f.value) as DatatableFilter[];
  }
  return undefined;
};

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

export const toFixedIfFloat = (value: number) => (value % 1 === 0 ? value : parseFloat(`${value}`)?.toFixed(3));

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
      return singular;
    default:
      return plural;
  }
};

export const isValidNumber = (value?: number): value is number => typeof value === "number" && !isNaN(value);

export const streamReader = async (stream: ReadableStream<string>, onChunk: (chunk: string) => void) => {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(value);
    }
  } catch (error) {
    throw error;
  } finally {
    reader.releaseLock();
  }
};
