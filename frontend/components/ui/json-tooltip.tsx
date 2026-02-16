import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Loader2 } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";

import { CopyButton } from "@/components/ui/copy-button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, isValidJsonObject } from "@/lib/utils";

interface JsonTooltipProps {
  data: Record<string, unknown> | unknown | string | null;
  columnSize?: number;
  className?: string;
  onOpen?: () => Promise<unknown>;
}

const ObjectWithMarkdown = ({ data }: { data: Record<string, any> }) => (
  <div className="text-xs font-mono text-secondary-foreground max-h-96 p-2">
    <div>{"{"}</div>
    <div className="pl-4 flex flex-col gap-0.5">
      {Object.entries(data).map(([key, value], index, array) => (
        <div key={key}>
          <span className="text-primary">&quot;{key}&quot;: </span>
          {typeof value === "string" ? (
            <Streamdown
              mode="static"
              parseIncompleteMarkdown={false}
              isAnimating={false}
              className="inline break-all"
              rehypePlugins={[defaultRehypePlugins.harden]}
              components={{
                p: ({ children, className, ...props }) => (
                  <span {...props} className={cn(className, "text-xs break-all inline")}>
                    {children}
                  </span>
                ),
                a: ({ children, className, href, ...props }) => (
                  <a
                    {...props}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(className, "text-primary/80 underline break-all")}
                  >
                    {children}
                  </a>
                ),
                code: ({ children, className, ...props }) => (
                  <code {...props} className={cn(className, "text-xs font-mono bg-muted px-1 rounded break-all")}>
                    {children}
                  </code>
                ),
                strong: ({ children, className, ...props }) => (
                  <strong {...props} className={cn(className, "font-semibold break-all")}>
                    {children}
                  </strong>
                ),
                em: ({ children, className, ...props }) => (
                  <em {...props} className={cn(className, "italic break-all")}>
                    {children}
                  </em>
                ),
              }}
            >
              {value}
            </Streamdown>
          ) : (
            <span className="wrap-break-word overflow-wrap-anywhere">{JSON.stringify(value)}</span>
          )}
          {index < array.length - 1 && <span>,</span>}
        </div>
      ))}
    </div>
    <div className="pb-2">{"}"}</div>
  </div>
);

const JsonTooltip = ({ data, columnSize, className, onOpen }: JsonTooltipProps) => {
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

  const displayValue = JSON.stringify(parsedData, null, 2);
  const tooltipData = resolvedData;
  const jsonString = JSON.stringify(tooltipData, null, 2);
  const isObject = typeof tooltipData === "object" && tooltipData !== null && !Array.isArray(tooltipData);

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild className="relative p-0">
          <pre
            style={{
              ...(columnSize
                ? {
                    width: columnSize - 32,
                  }
                : {}),
            }}
            className={cn("font-mono text-secondary-foreground overflow-hidden text-xs truncate", className)}
          >
            {displayValue}
          </pre>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="bottom"
            className="relative p-0 border max-w-96 max-h-96 min-h-8 min-w-32"
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

                <ScrollArea className="max-w-96">
                  {isObject ? (
                    <ObjectWithMarkdown data={tooltipData as Record<string, any>} />
                  ) : (
                    <div className="text-xs font-mono text-secondary-foreground p-2 max-h-96 whitespace-pre-wrap wrap-anywhere">
                      {jsonString}
                    </div>
                  )}
                </ScrollArea>
              </>
            )}
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
};

export default memo(JsonTooltip);
