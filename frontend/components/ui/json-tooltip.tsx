import { TooltipPortal } from "@radix-ui/react-tooltip";
import React, { memo, useMemo } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";

import { CopyButton } from "@/components/ui/copy-button.tsx";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, isValidJsonObject } from "@/lib/utils";

interface JsonTooltipProps {
  data: Record<string, unknown> | unknown | string | null;
  columnSize?: number;
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
              className="inline"
              rehypePlugins={[defaultRehypePlugins.harden]}
              components={{
                p: ({ children, className, ...props }) => (
                  <span {...props} className={cn(className, "text-xs")}>
                    {children}
                  </span>
                ),
                a: ({ children, className, href, ...props }) => (
                  <a
                    {...props}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(className, "text-primary hover:underline")}
                  >
                    {children}
                  </a>
                ),
                code: ({ children, className, ...props }) => (
                  <code {...props} className={cn(className, "text-xs font-mono bg-muted px-1 rounded")}>
                    {children}
                  </code>
                ),
                strong: ({ children, className, ...props }) => (
                  <strong {...props} className={cn(className, "font-semibold")}>
                    {children}
                  </strong>
                ),
                em: ({ children, className, ...props }) => (
                  <em {...props} className={cn(className, "italic")}>
                    {children}
                  </em>
                ),
              }}
            >
              {value}
            </Streamdown>
          ) : (
            <span>{JSON.stringify(value)}</span>
          )}
          {index < array.length - 1 && <span>,</span>}
        </div>
      ))}
    </div>
    <div className="pb-2">{"}"}</div>
  </div>
);

const JsonTooltip = ({ data, columnSize }: JsonTooltipProps) => {
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

  if (
    parsedData == null ||
    parsedData === "" ||
    (isValidJsonObject(parsedData) && Object.keys(parsedData).length === 0)
  ) {
    return <span className="text-muted-foreground">-</span>;
  }

  const jsonString = JSON.stringify(parsedData, null, 2);
  const displayValue = JSON.stringify(parsedData);

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild className="relative p-0">
          <div
            style={{
              ...(columnSize
                ? {
                    width: columnSize - 32,
                  }
                : {}),
            }}
            className="line-clamp-2"
          >
            {displayValue}
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="bottom"
            className="relative p-0 border max-w-96 max-h-96 min-h-8 min-w-16"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <CopyButton
              size="icon"
              variant="ghost"
              className="size-3.5 absolute right-2 top-2 bg-secondary z-10"
              iconClassName="size-3.5 text-secondary-foreground"
              text={jsonString}
            />

            <ScrollArea>
              <ObjectWithMarkdown data={parsedData as Record<string, any>} />
            </ScrollArea>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
};

export default memo(JsonTooltip);
