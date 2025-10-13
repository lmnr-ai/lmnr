import React, { memo, useMemo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";

import { CopyButton } from "@/components/ui/copy-button.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface JsonTooltipProps {
  data: Record<string, unknown> | unknown | string | null;
  columnSize?: number;
}

const JsonTooltip = ({ data, columnSize }: JsonTooltipProps) => {
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
  const displayValue = JSON.stringify(parsedData);

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger className="relative p-0">
          {columnSize ? (
            <div
              style={{
                width: columnSize - 32,
              }}
              className="relative"
            >
              <div className="absolute inset-0 top-[-4px] items-center h-full flex">
                <div className="text-ellipsis overflow-hidden whitespace-nowrap text-xs">{displayValue}</div>
              </div>
            </div>
          ) : (
            <div className="text-ellipsis overflow-hidden whitespace-nowrap text-xs font-mono">{displayValue}</div>
          )}
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="p-2 border max-w-96 max-h-96 overflow-auto"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="relative space-y-2">
            <CopyButton
              size="icon"
              variant="ghost"
              className="h-6 w-6 ml-auto absolute right-0.5 top-0.5"
              iconClassName="h-3 w-3"
              text={jsonString}
            />
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
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default memo(JsonTooltip);
