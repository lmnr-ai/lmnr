import React, { memo, useMemo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";

import { CopyButton } from "@/components/ui/copy-button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface JsonTooltipProps {
  data: Record<string, unknown> | unknown | string | null;
  label?: string;
  displayValue?: string;
  columnSize?: number;
  showCopyButton?: boolean;
  triggerClassName?: string;
}

const JsonTooltip = ({
  data,
  label,
  displayValue,
  columnSize,
  showCopyButton = true,
  triggerClassName = "",
}: JsonTooltipProps) => {
  const parsedData = useMemo(() => {
    if (!data) return null;

    if (typeof data === "string") {
      try {
        return JSON.parse(data);
      } catch {
        return { value: data };
      }
    }

    return data;
  }, [data]);

  if (!parsedData || Object.keys(parsedData).length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  const jsonString = JSON.stringify(parsedData, null, 2);
  const defaultDisplayValue = JSON.stringify(parsedData);

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger className={`relative p-0 ${triggerClassName}`}>
          {columnSize ? (
            <div
              style={{
                width: columnSize - 32,
              }}
              className="relative"
            >
              <div className="absolute inset-0 top-[-4px] items-center h-full flex">
                <div className="text-ellipsis overflow-hidden whitespace-nowrap text-xs">
                  {displayValue ?? defaultDisplayValue}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-ellipsis overflow-hidden whitespace-nowrap text-xs font-mono">
              {displayValue ?? defaultDisplayValue}
            </div>
          )}
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="p-2 border max-w-96 max-h-96 overflow-auto"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="space-y-2">
            {(label || showCopyButton) && (
              <div className="flex items-center justify-between gap-2 pb-1 border-b">
                {label && <span className="text-xs font-medium">{label}</span>}
                {showCopyButton && (
                  <CopyButton
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 ml-auto"
                    iconClassName="h-3 w-3"
                    text={jsonString}
                  />
                )}
              </div>
            )}
            <div>
              <SyntaxHighlighter
                language="json"
                style={oneDark}
                customStyle={{
                  backgroundColor: "transparent",
                  padding: "0",
                  margin: "0",
                  fontSize: "0.75rem",
                  lineHeight: "1.4",
                }}
                codeTagProps={{
                  style: {
                    backgroundColor: "transparent",
                  },
                }}
              >
                {jsonString}
              </SyntaxHighlighter>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default memo(JsonTooltip);
