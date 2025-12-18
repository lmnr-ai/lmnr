import { z } from "zod/v4";

export const parseUrlParams = <T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>,
  arrayParams: string[] = ["filter", "searchIn"]
) => {
  const obj = Object.fromEntries(
    Array.from(searchParams.keys()).map((key) => {
      const values = searchParams.getAll(key);
      return [key, arrayParams.includes(key) ? values : values[0]];
    })
  );

  return schema.safeParse(obj);
};
/**
 * This function has special handling for arrays that were serialized on the server using
 * comma separation. If normal JSON.parse fails,
 * it attempts to parse by wrapping the value in brackets to create a valid JSON array.
 */
export const tryParseJson = (value: string) => {
  if (value === "" || value === undefined) return null;

  try {
    return JSON.parse(value);
  } catch (e) {
    // Parse with brackets because we stringify array using comma separator on server.
    try {
      return JSON.parse(`[${value}]`);
    } catch (e2) {
      return value;
    }
  }
};

export const deepParseJson = (value: unknown): unknown => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return deepParseJson(parsed);
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    return value.map(deepParseJson);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, deepParseJson(v)])
    );
  }

  return value;
};
