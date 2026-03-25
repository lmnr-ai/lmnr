import { head, isNil } from "lodash";
import { useMemo } from "react";
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
  className?: string;
  contentClassName?: string;
}

const Markdown = ({ output, className, contentClassName }: MarkdownProps) => {
  const formattedOutput = useMemo(() => {
    if (!output) return "";
    return formatOutput(output);
  }, [output]);

  return (
    <div className={cn("text-white/60 [&_*]:text-inherit", className)}>
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
