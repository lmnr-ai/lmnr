import { TraceViewListSpan } from "@/components/traces/trace-view/trace-view-store.tsx";
import { tryParseJson } from "@/lib/utils.ts";

export const generateSpanPathKey = (span: TraceViewListSpan): string => {
  if (!span.pathInfo) {
    return span.name;
  }

  const pathSegments = span.pathInfo.full.map((item) => item.name);
  pathSegments.push(span.name);

  return pathSegments.join(", ");
};

export const extractKeys = (
  obj: any,
  maxKeys: number = 10
): {
  key: string;
  template: string;
}[] => {
  const keys: {
    key: string;
    template: string;
  }[] = [];

  const collectKeys = (
    value: any,
    prefix: string = "",
    isTopLevel: boolean = false,
    arrayContext: string = ""
  ): void => {
    if (keys.length >= maxKeys) return;

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      if (prefix && !keys.some((k) => k.key === prefix)) {
        if (arrayContext) {
          const pathInArray = prefix.replace(`${arrayContext}.`, "");
          keys.push({
            key: prefix,
            template: `{{#${arrayContext}}}{{${pathInArray}}}{{/${arrayContext}}}`,
          });
        } else {
          keys.push({ key: prefix, template: `{{${prefix}}}` });
        }
      }
      return;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return;

      if (isTopLevel) {
        collectKeys(value[0], "", false, "");
      } else {
        const itemsToCheck = Math.min(5, value.length);
        const seenKeys = new Set<string>();

        for (let i = 0; i < itemsToCheck; i++) {
          const item = value[i];
          if (typeof item === "object" && item !== null) {
            for (const key of Object.keys(item)) {
              const newPrefix = prefix ? `${prefix}.${key}` : key;
              if (!seenKeys.has(newPrefix)) {
                seenKeys.add(newPrefix);
                collectKeys(item[key], newPrefix, false, prefix);
              }
            }
          }
        }
      }
      return;
    }
    if (typeof value === "object" && value !== null) {
      collectKeysFromObject(value, prefix, arrayContext);
    }
  };

  const collectKeysFromObject = (obj: any, prefix: string, arrayContext: string): void => {
    for (const key of Object.keys(obj)) {
      if (keys.length >= maxKeys) break;
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      collectKeys(obj[key], newPrefix, false, arrayContext);
    }
  };

  const parsed = tryParseJson(obj);
  collectKeys(parsed !== null ? parsed : obj, "", true, "");
  return keys;
};
