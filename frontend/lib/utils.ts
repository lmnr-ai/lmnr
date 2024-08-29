import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { InputVariable, PipelineVisibility } from './pipeline/types';
import { ChatMessageContentPart, DatatableFilter } from './types';
import * as Y from 'yjs';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function fetcher<JSON = any>(
  url: string,
  init: any
): Promise<Response> {
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1${url}`, {
    ...init,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text()

    throw new Error(text)
  }

  return res;
}

export async function fetcherJSON<JSON = any>(
  url: string,
  init: any
): Promise<JSON> {
  const res = await fetch(`${process.env.BACKEND_URL}/api/v1${url}`, {
    ...init,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text)
  }

  return await res.json() as JSON;
}

export const swrFetcher = (url: string) => fetch(url).then(res => res.json()).catch(err => console.error(err));

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
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

export function formatTimestamp(timestampStr: string): string {
  const date = new Date(timestampStr);
  return _innerFormatTimestamp(date);
}

export function formatTimestampFromSeconds(seconds: number): string {
  const date = new Date(seconds * 1000);
  return _innerFormatTimestamp(date);
}

// Note that the formatted time is calculated for local time
function _innerFormatTimestamp(date: Date): string {
  const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  const dateOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

  const timeStr = date.toLocaleString('en-US', timeOptions).replace(/^24:/, '00:');
  const dateStr = date.toLocaleString('en-US', dateOptions);

  // TODO: Add year, if it's not equal to current year

  return `${dateStr}, ${timeStr}`;
}


export const getLocalEnvVars = (projectId: string): Record<string, string> => {
  return JSON.parse(localStorage?.getItem(`env-${projectId}`) ?? '{}');
}

export const setLocalEnvVar = (projectId: string, key: string, value: string) => {
  const localEnvVars = getLocalEnvVars(projectId);
  localStorage.setItem(`env-${projectId}`, JSON.stringify({ ...localEnvVars, [key]: value }));
}

export const deleteLocalEnvVar = (projectId: string, key: string) => {
  const localEnvVars = getLocalEnvVars(projectId);
  delete localEnvVars[key];
  localStorage.setItem(`env-${projectId}`, JSON.stringify(localEnvVars));
}

export const getLocalDevSessions = (projectId: string): Record<string, string> => {
  return JSON.parse(localStorage?.getItem(`dev-sessions-${projectId}`) ?? '{}');
}

export const setLocalDevSession = (projectId: string, key: string, value: string) => {
  const localDevSessions = getLocalDevSessions(projectId);
  localStorage.setItem(`dev-sessions-${projectId}`, JSON.stringify({ ...localDevSessions, [key]: value }));
}

export const deleteLocalDevSession = (projectId: string, key: string) => {
  const localDevSessions = getLocalDevSessions(projectId);
  delete localDevSessions[key];
  localStorage.setItem(`dev-sessions-${projectId}`, JSON.stringify(localDevSessions));
}

// If unseen state, then use it to fill out inputs
export const STORED_INPUTS_STATE_UNSEEN = 'INPUTS_UNSEEN_STATE';
// If seen state, then use allInputs to fill out inputs
export const STORED_INPUTS_STATE_SEEN = 'INPUTS_SEEN_STATE';

export const getStoredInputs = (pipelineVersionId: string, focusedNodeId: string | null, pipelineVisibility: PipelineVisibility = "PRIVATE") => {
  const innerKey = (focusedNodeId === null) ? 'pipeline' : `node-${focusedNodeId}`;
  const key = `${pipelineVisibility === "PUBLIC" ? 'public-' : ''}pipeline-inputs-${pipelineVersionId}`;
  const localPipelineInputs = JSON.parse(localStorage.getItem(key) ?? '{}');

  if (!localPipelineInputs[innerKey]) {
    return {
      state: STORED_INPUTS_STATE_UNSEEN,
      inputs: []
    };
  }

  return localPipelineInputs[innerKey];
}

/**
 * Set local pipeline inputs to the UNSEEN_STATE
 */
export const convertAllStoredInputsToUnseen = (pipelineVersionId: string, pipelineVisibility: PipelineVisibility = "PRIVATE") => {
  const inputsKey = `${pipelineVisibility === "PUBLIC" ? 'public-' : ''}pipeline-inputs-${pipelineVersionId}`;
  const localPipelineInputs = JSON.parse(localStorage.getItem(inputsKey) ?? '{}');
  const preparedLocalPipelineInputs = Object.keys(localPipelineInputs).reduce((acc, key) => {
    return { ...acc, [key]: { state: STORED_INPUTS_STATE_UNSEEN, inputs: localPipelineInputs[key].inputs } };
  }, {});
  localStorage.setItem(inputsKey, JSON.stringify(preparedLocalPipelineInputs));
}

/**
 * Set local inputs for focusedNodeid to UNSEEN_STATE
 */
export const convertStoredInputToUnseen = (pipelineVersionId: string, focusedNodeId: string | null, pipelineVisibility: PipelineVisibility = "PRIVATE") => {
  const innerKey = (focusedNodeId === null) ? 'pipeline' : `node-${focusedNodeId}`;
  const key = `${pipelineVisibility === "PUBLIC" ? 'public-' : ''}pipeline-inputs-${pipelineVersionId}`;
  const localPipelineInputs = JSON.parse(localStorage.getItem(key) ?? '{}');

  if (!!localPipelineInputs[innerKey]) {
    localPipelineInputs[innerKey] = { ...localPipelineInputs[innerKey], state: STORED_INPUTS_STATE_UNSEEN };
    localStorage.setItem(key, JSON.stringify(localPipelineInputs));
  }
}

export const setStoredInputs = (pipelineVersionId: string, focusedNodeId: string | null, inputs: InputVariable[][], pipelineVisibility: PipelineVisibility = "PRIVATE") => {
  const innerKey = (focusedNodeId === null) ? 'pipeline' : `node-${focusedNodeId}`;
  const key = `${pipelineVisibility === "PUBLIC" ? 'public-' : ''}pipeline-inputs-${pipelineVersionId}`;
  const localPipelineInputs = JSON.parse(localStorage.getItem(key) ?? '{}');
  localStorage.setItem(key, JSON.stringify({ ...localPipelineInputs, [innerKey]: { state: STORED_INPUTS_STATE_SEEN, inputs } }));
}

/**
 * Simple hash function to generate a short unique (with high-probability) identifier
 *
 * It doesn't use numbers so that in the code-generated nodes there are no numbers in the variables.
 */
export function generateShortHash() {
  const chars = 'abcdefghkmnopqrstuxyz0123456789';
  let hash = '';
  for (let i = 0; i < 6; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return hash;
}

export const isStringType = (content: string | ChatMessageContentPart[]): content is string => {
  return (typeof content === 'string' || content instanceof String)
}

export function deep<T>(value: T): T {
  if (typeof value !== 'object' || value === null) {
    return value
  }
  if (Array.isArray(value)) {
    return deepArray(value)
  }
  return deepObject(value)
}

function deepObject<T extends {}>(source: T) {
  const result = {} as T
  Object.keys(source).forEach((key) => {
    const value = source[key as keyof T]
    result[key as keyof T] = deep(value)
  }, {})
  return result as T
}

function deepArray<T extends any[]>(collection: T): any {
  return collection.map((value) => {
    return deep(value)
  })
}

export function toYjsObject(obj: any): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    throw new Error(`Unsupported type: ${typeof obj}`);
  }

  const ymap = new Y.Map();

  for (let key of Object.keys(obj)) {

    const value = obj[key];
    if (value === null || value === undefined) {
      ymap.set(key, new Y.Text());
    } else if (typeof value === 'string') {
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
    return filters.filter((f: any) => typeof f === 'object' && f.column && f.operator && f.value) as DatatableFilter[];
  }
  return undefined;
}