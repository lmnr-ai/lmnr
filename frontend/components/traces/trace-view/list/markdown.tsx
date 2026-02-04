import { head, isNil } from "lodash";
import Mustache from "mustache";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";

import { cn, tryParseJson } from "@/lib/utils.ts";

const formatOutput = (output: any): string => {
  const PRIORITY_KEYS = ["content", "text", "message", "data", "output"];
  const METADATA_KEYS = ["role", "type", "id", "name", "model", "metadata"];
  const MAX_DEPTH = 10;

  const isEmpty = (result: string): boolean => !result || result === "" || result === "[]" || result === "{}";

  const tryKeys = (obj: Record<string, any>, keys: string[], depth: number): string => {
    for (const key of keys) {
      if (key in obj) {
        const result = drillDown(obj[key], depth + 1);
        if (!isEmpty(result)) return result;
      }
    }
    return "";
  };

  const drillDown = (value: any, depth: number = 0): string => {
    if (depth > MAX_DEPTH) return JSON.stringify(value);
    if (typeof value === "string") return value;
    if (isNil(value)) return "";

    if (Array.isArray(value)) {
      if (value.length === 0) return "";
      const firstItem = head(value);
      return isNil(firstItem) ? "" : drillDown(firstItem, depth + 1);
    }

    if (typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.length === 0) return "";

      const priorityResult = tryKeys(value, PRIORITY_KEYS, depth);
      if (!isEmpty(priorityResult)) return priorityResult;

      const meaningfulKeys = keys.filter((key) => !PRIORITY_KEYS.includes(key) && !METADATA_KEYS.includes(key));
      const meaningfulResult = tryKeys(value, meaningfulKeys, depth);
      if (!isEmpty(meaningfulResult)) return meaningfulResult;

      const metadataResult = tryKeys(value, METADATA_KEYS, depth);
      if (!isEmpty(metadataResult)) return metadataResult;

      return JSON.stringify(value);
    }

    return JSON.stringify(value);
  };

  const parsed = tryParseJson(output);
  return drillDown(parsed !== null ? parsed : output);
};

interface MarkdownProps {
  output: any;
  defaultValue?: string;
  className?: string;
}

const preprocessDataForMustache = (data: any): any => {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(preprocessDataForMustache);
  }

  if (typeof data === "object") {
    const processed: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        processed[key] = value;
      } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        processed[key] = value;
      } else if (Array.isArray(value)) {
        processed[key] = preprocessDataForMustache(value);
      } else if (typeof value === "object") {
        // Convert nested objects to formatted JSON strings
        const jsonStr = JSON.stringify(value, null, 2);
        // Keep the original key for the object, but add a new key with the JSON string
        processed[`${key}Json`] = jsonStr;

        processed[key] = preprocessDataForMustache(value);
      } else {
        processed[key] = value;
      }
    }
    return processed;
  }

  return data;
};

const Markdown = ({ output, defaultValue, className }: MarkdownProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  const maskImage = useMemo(() => {
    if (canScrollUp && canScrollDown) {
      return "linear-gradient(to bottom, transparent, black 24px, black calc(100% - 30px), transparent)";
    } else if (canScrollUp) {
      return "linear-gradient(to bottom, transparent, black 30px)";
    } else if (canScrollDown) {
      return "linear-gradient(to bottom, black calc(100% - 60px), transparent)";
    }
    return undefined;
  }, [canScrollUp, canScrollDown]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();
    el.addEventListener("scroll", updateScrollState);

    const resizeObserver = new ResizeObserver(updateScrollState);
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener("scroll", updateScrollState);
      resizeObserver.disconnect();
    };
  }, [updateScrollState]);

  const formattedOutput = useMemo(() => {
    if (!output) return "";

    if (defaultValue) {
      try {
        const parsed = tryParseJson(output);
        const data = parsed !== null ? parsed : output;

        const unwrappedData = Array.isArray(data) && data.length === 1 ? data[0] : data;
        const processedData = preprocessDataForMustache(unwrappedData);
        let rendered = Mustache.render(defaultValue, processedData);

        // Unescape HTML entities that Mustache escaped (like &quot; back to ")
        rendered = rendered
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#x27;/g, "'");

        return rendered;
      } catch (_) {
        return formatOutput(output);
      }
    }

    return formatOutput(output);
  }, [output, defaultValue]);

  return (
    <div
      ref={scrollRef}
      className={cn("h-full overflow-auto text-white/60 [&_*]:text-inherit", className)}
      style={{ maskImage, WebkitMaskImage: maskImage }}
    >
      <div className="pb-2">
        <Streamdown
          mode="static"
          parseIncompleteMarkdown={false}
          isAnimating={false}
          className="rounded text-wrap"
          rehypePlugins={[defaultRehypePlugins.harden]}
          components={{
            h1: ({ children, className, ...props }) => (
              <h1 {...props} className={cn(className, "text-base")}>
                {children}
              </h1>
            ),
            p: ({ children, className, ...props }) => (
              <p {...props} className={cn(className, "text-sm")}>
                {children}
              </p>
            ),
            li: ({ children, className, ...props }) => (
              <li {...props} className={cn(className, "text-sm")}>
                {children}
              </li>
            ),
            ul: ({ children, className, ...props }) => (
              <ul {...props} className={cn(className, "text-sm list-disc pl-6")}>
                {children}
              </ul>
            ),
            ol: ({ children, className, ...props }) => (
              <ol {...props} className={cn(className, "text-sm list-decimal pl-6")}>
                {children}
              </ol>
            ),
            code: ({ children, className, ...props }) => (
              <code {...props} className={cn(className, "text-sm font-mono whitespace-pre-wrap")}>
                {children}
              </code>
            ),
          }}
        >
          {formattedOutput}
        </Streamdown>
      </div>
    </div>
  );
};

export default Markdown;
