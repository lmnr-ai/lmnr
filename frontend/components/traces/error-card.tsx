import { ChevronRight, CircleAlert } from "lucide-react";
import React, { memo, useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { CopyButton } from "@/components/ui/copy-button.tsx";
import { ErrorEventAttributes } from "@/lib/types";

interface ErrorCardProps {
  attributes: ErrorEventAttributes;
}

const ErrorCard = ({ attributes }: ErrorCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const errorType = attributes["exception.type"];
  const errorMessage = attributes["exception.message"];
  const errorTrace = attributes["exception.stacktrace"];

  const traceLines = errorTrace?.split("\n").filter((line) => line.trim()) || [];

  return (
    <Collapsible className="group" open={isOpen} onOpenChange={setIsOpen}>
      <div className="text-destructive max-h-48 overflow-x-hidden no-scrollbar bg-card rounded-md border">
        <div
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-start gap-2 w-full p-2 text-left rounded-md cursor-pointer"
        >
          <CircleAlert className="w-4 h-4 min-w-4 min-h-4" />
          <div className="flex flex-1 items-start justify-between">
            <div className="break-all">
              <h3 className="font-medium text-xs">{errorType || "Exception occurred"}</h3>
              {errorMessage && (
                <p className="text-xs mt-0.5">
                  {isOpen ? errorMessage : `${errorMessage.substring(0, 60)}${errorMessage.length > 60 ? "..." : ""}`}
                </p>
              )}
            </div>
            <div className="flex h-full">
              <CopyButton
                className="w-8 h-8"
                iconClassName="h-3 w-3 text-muted-foreground"
                size="icon"
                variant="ghost"
                text={JSON.stringify(attributes)}
              />
              <Button className="w-8 h-8" size="icon" variant="ghost">
                <ChevronRight className="w-3 h-3 text-muted-foreground group-data-[state=open]:rotate-90 transition-transform duration-200" />
              </Button>
            </div>
          </div>
        </div>
        <CollapsibleContent className="px-2 pb-2 ml-6">
          {errorMessage && (
            <div className="mb-2">
              <p className="text-muted-foreground text-xs mb-1">Full error details:</p>
              <div className="bg-muted rounded-sm p-2 border">
                <pre className="text-xs text-foreground whitespace-pre-wrap font-mono break-all">{errorMessage}</pre>
              </div>
            </div>
          )}
          {traceLines.length > 0 && (
            <>
              <p className="text-muted-foreground text-xs mb-1">Stack trace:</p>
              <div className="space-y-0.5 overflow-hidden">
                {traceLines.map((line, index) => (
                  <div key={index} className="flex items-start gap-1.5">
                    <div className="w-1 h-1 bg-red-500 rounded-full mt-1.5 flex-shrink-0"></div>
                    <span className="text-xs font-mono break-all overflow-hidden">{line.trim()}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default memo(ErrorCard);
