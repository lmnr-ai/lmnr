import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Loader2 } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";

import { CopyButton } from "@/components/ui/copy-button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, isValidJsonObject } from "@/lib/utils";

interface JsonTooltipProps {
  data: Record<string, unknown> | unknown | string | null;
  columnSize?: number;
  className?: string;
  onOpen?: () => Promise<unknown>;
  /**
   * Opt-in per-key action: keys of an object value become clickable so the
   * traces table can promote a metadata key to a custom column.
   */
  onAddKeyColumn?: (key: string) => void;
  /** Keys that are already custom columns, so the tooltip can mute them. */
  isKeyColumn?: (key: string) => boolean;
}

const breakStyle = { wordBreak: "break-all" as const, overflowWrap: "anywhere" as const };

const MarkdownValue = ({ value }: { value: string }) => (
  <Streamdown
    mode="static"
    parseIncompleteMarkdown={false}
    isAnimating={false}
    className="inline"
    rehypePlugins={[defaultRehypePlugins.harden]}
    components={{
      p: ({ children, className, ...props }) => (
        <span {...props} className={cn(className, "text-xs inline")} style={breakStyle}>
          {children}
        </span>
      ),
      a: ({ children, className, href, ...props }) => (
        <a
          {...props}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(className, "text-primary/80 underline")}
          style={breakStyle}
        >
          {children}
        </a>
      ),
      code: ({ children, className, ...props }) => (
        <code {...props} className={cn(className, "text-xs font-mono bg-muted px-1 rounded")} style={breakStyle}>
          {children}
        </code>
      ),
      pre: ({ children, className, ...props }) => (
        <pre {...props} className={cn(className, "text-xs font-mono whitespace-pre-wrap")} style={breakStyle}>
          {children}
        </pre>
      ),
      strong: ({ children, className, ...props }) => (
        <strong {...props} className={cn(className, "font-semibold")} style={breakStyle}>
          {children}
        </strong>
      ),
      em: ({ children, className, ...props }) => (
        <em {...props} className={cn(className, "italic")} style={breakStyle}>
          {children}
        </em>
      ),
      span: ({ children, className, ...props }) => (
        <span {...props} className={className} style={breakStyle}>
          {children}
        </span>
      ),
      div: ({ children, className, ...props }) => (
        <div {...props} className={className} style={breakStyle}>
          {children}
        </div>
      ),
    }}
  >
    {value}
  </Streamdown>
);

const JsonValue = ({ value }: { value: unknown }) =>
  typeof value === "string" ? (
    <span className="inline" style={breakStyle}>
      <MarkdownValue value={value} />
    </span>
  ) : (
    <span style={breakStyle}>{JSON.stringify(value)}</span>
  );

export const ObjectWithMarkdown = ({
  data,
  onAddKeyColumn,
  isKeyColumn,
}: {
  data: Record<string, any>;
  onAddKeyColumn?: (key: string) => void;
  isKeyColumn?: (key: string) => boolean;
}) => {
  const [addedKeys, setAddedKeys] = useState<Set<string>>(() => new Set());

  const handleAdd = useCallback(
    (key: string) => {
      onAddKeyColumn?.(key);
      setAddedKeys((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    },
    [onAddKeyColumn]
  );

  return (
    <div className="text-xs font-mono text-secondary-foreground p-2 max-h-96" style={breakStyle}>
      <div>{"{"}</div>
      <div className="pl-4 flex flex-col gap-0.5" style={breakStyle}>
        {Object.entries(data).map(([key, value], index, array) => {
          const isAdded = addedKeys.has(key) || !!isKeyColumn?.(key);
          return (
            <div key={key} style={breakStyle}>
              {onAddKeyColumn && !isAdded ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Add "${key}" as a column`}
                  className="cursor-pointer text-primary hover:underline underline-offset-2"
                  style={breakStyle}
                  onClick={() => handleAdd(key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleAdd(key);
                    }
                  }}
                >
                  &quot;{key}&quot;
                </span>
              ) : (
                <span className={onAddKeyColumn ? "text-muted-foreground" : "text-primary"} style={breakStyle}>
                  &quot;{key}&quot;
                </span>
              )}
              <span>: </span>
              <JsonValue value={value} />
              {index < array.length - 1 && <span>,</span>}
            </div>
          );
        })}
      </div>
      <div>{"}"}</div>
      {onAddKeyColumn && (
        <p className="pt-1.5 text-[10px] font-sans text-muted-foreground">Click a key to add it as a column</p>
      )}
    </div>
  );
};

const JsonTooltip = ({ data, columnSize, className, onOpen, onAddKeyColumn, isKeyColumn }: JsonTooltipProps) => {
  const [fullData, setFullData] = useState<unknown>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef(false);

  const parsedData = useMemo(() => {
    if (data == null) return null;

    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch (e) {
        return data;
      }
    }

    return data;
  }, [data]);

  const resolvedData = useMemo(() => {
    if (fullData === undefined) return parsedData;
    if (fullData == null) return parsedData;
    if (typeof fullData === "string") {
      try {
        return JSON.parse(fullData);
      } catch {
        return fullData;
      }
    }
    return fullData;
  }, [fullData, parsedData]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (open && onOpen && !fetchedRef.current) {
        fetchedRef.current = true;
        setIsLoading(true);
        onOpen()
          .then((value) => setFullData(value))
          .catch(() => {})
          .finally(() => setIsLoading(false));
      }
    },
    [onOpen]
  );

  if (
    parsedData == null ||
    parsedData === "" ||
    (isValidJsonObject(parsedData) && Object.keys(parsedData).length === 0)
  ) {
    return <span className="text-muted-foreground">-</span>;
  }

  const displayValue = typeof parsedData === "string" ? parsedData : JSON.stringify(parsedData, null, 2);
  const tooltipData = resolvedData;
  const jsonString = typeof tooltipData === "string" ? tooltipData : JSON.stringify(tooltipData, null, 2);
  const isObject = typeof tooltipData === "object" && tooltipData !== null && !Array.isArray(tooltipData);

  return (
    <Tooltip delayDuration={100} onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild className="relative p-0">
        <pre
          style={
            columnSize
              ? {
                  width: columnSize - 32,
                }
              : {}
          }
          className={cn("font-mono text-secondary-foreground overflow-hidden text-xs truncate", className)}
        >
          {displayValue}
        </pre>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          side="bottom"
          className="relative p-0 border max-w-[32rem] max-h-96 min-h-8 min-w-32"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <CopyButton
                size="icon"
                variant="ghost"
                className="size-3.5 absolute right-2 top-2 bg-secondary z-10"
                iconClassName="size-3.5 text-secondary-foreground"
                text={jsonString}
              />

              <ScrollArea className="max-w-[32rem]">
                {isObject ? (
                  <ObjectWithMarkdown
                    data={tooltipData as Record<string, any>}
                    onAddKeyColumn={onAddKeyColumn}
                    isKeyColumn={isKeyColumn}
                  />
                ) : (
                  <div className="text-xs font-mono text-secondary-foreground p-2 max-h-96 whitespace-pre-wrap break-all">
                    {jsonString}
                  </div>
                )}
              </ScrollArea>
            </>
          )}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};

export default memo(JsonTooltip);
