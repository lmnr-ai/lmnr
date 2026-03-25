import { head, isNil } from "lodash";
import Mustache from "mustache";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";

import { preprocessForMustache } from "@/lib/actions/spans/reader-utils";
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
  /** Raw span output data — only needed for MustacheTemplateSheet's template rendering */
  output?: any;
  /** Mustache template to render against output — only used when output is provided */
  defaultValue?: string;
  /** Pre-rendered preview text — displayed directly without mustache rendering */
  previewText?: string;
  className?: string;
  contentClassName?: string;
}

const Markdown = ({ output, defaultValue, previewText, className, contentClassName }: MarkdownProps) => {
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
    // Use pre-rendered preview text when available
    if (previewText) return previewText;

    if (!output) return "";

    if (defaultValue) {
      try {
        const parsed = tryParseJson(output);
        const data = parsed !== null ? parsed : output;

        const unwrappedData = Array.isArray(data) && data.length === 1 ? data[0] : data;
        const processedData = preprocessForMustache(unwrappedData);
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
  }, [output, defaultValue, previewText]);

  return (
    <div
      ref={scrollRef}
      className={cn("h-full overflow-auto text-white/60 [&_*]:text-inherit", className)}
      style={{ maskImage, WebkitMaskImage: maskImage }}
    >
      <div className={cn("pb-2", contentClassName)}>
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
              <p {...props} className={cn(className, "text-[13px]")}>
                {children}
              </p>
            ),
            li: ({ children, className, ...props }) => (
              <li {...props} className={cn(className, "text-[13px]")}>
                {children}
              </li>
            ),
            ul: ({ children, className, ...props }) => (
              <ul {...props} className={cn(className, "text-[13px] list-disc pl-6")}>
                {children}
              </ul>
            ),
            ol: ({ children, className, ...props }) => (
              <ol {...props} className={cn(className, "text-[13px] list-decimal pl-6")}>
                {children}
              </ol>
            ),
            code: ({ children, className, ...props }) => (
              <code {...props} className={cn(className, "text-[13px] font-mono whitespace-pre-wrap")}>
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
