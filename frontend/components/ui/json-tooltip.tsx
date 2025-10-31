import { TooltipPortal } from "@radix-ui/react-tooltip";
import React, { memo, useMemo } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";

import { githubDarkSyntaxHighlighter } from "@/components/ui/code-highlighter/utils.ts";
import { CopyButton } from "@/components/ui/copy-button.tsx";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isValidJsonObject } from "@/lib/utils";

interface JsonTooltipProps {
  data: Record<string, unknown> | unknown | string | null;
  columnSize?: number;
}

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

  if (parsedData == null || parsedData === "" || (isValidJsonObject(parsedData) && Object.keys(parsedData).length === 0)) {
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
            className="truncate"
          >
            {displayValue}
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent
            side="bottom"
            className="p-2 border max-w-96 max-h-96 min-h-8 min-w-16 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="relative space-y-2">
              <CopyButton
                size="icon"
                variant="ghost"
                className="h-3 w-3 absolute right-0.5 top-0.5 bg-secondary"
                iconClassName="h-3 w-3"
                text={jsonString}
              />
              <SyntaxHighlighter
                wrapLines
                lineProps={{ style: { wordBreak: "break-all", whiteSpace: "pre-wrap" } }}
                language="json"
                style={githubDarkSyntaxHighlighter}
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
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
};

export default memo(JsonTooltip);
