export type JsonObject = { [key: PropertyKey]: JsonObject | string | number | boolean | null | JsonObject[] } | null;
