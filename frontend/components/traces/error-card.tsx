import { ChevronDown, ChevronRight, CircleAlert } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border bg-card rounded-md text-destructive">
        <CollapsibleTrigger className="w-full p-2 text-left rounded-md">
          <div className="flex items-start gap-2">
            <CircleAlert className="w-4 h-4" />
            <div className="flex flex-1 items-center justify-between">
              <div>
                <h3 className="font-medium text-xs">{errorType || "Exception occurred"}</h3>
                {errorMessage && (
                  <p className="text-xs mt-0.5">
                    {isOpen ? errorMessage : `${errorMessage.substring(0, 60)}${errorMessage.length > 60 ? "..." : ""}`}
                  </p>
                )}
              </div>
              <div className="text-muted-foreground ml-2">
                {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </div>
            </div>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-2 pb-2 ml-6">
          {errorMessage && (
            <div className="mb-2">
              <p className="text-muted-foreground text-xs mb-1">Full error details:</p>
              <div className="bg-muted rounded-sm p-2 border">
                <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">{errorMessage}</pre>
              </div>
            </div>
          )}
          {traceLines.length > 0 && (
            <div>
              <p className="text-muted-foreground text-xs mb-1">Stack trace:</p>
              <div className="space-y-0.5">
                {traceLines.slice(0, isOpen ? traceLines.length : 3).map((line, index) => (
                  <div key={index} className="flex items-start gap-1.5">
                    <div className="w-1 h-1 bg-red-500 rounded-full mt-1.5 flex-shrink-0"></div>
                    <span className="text-xs font-mono break-all">{line.trim()}</span>
                  </div>
                ))}
                {!isOpen && traceLines.length > 3 && (
                  <div className="flex items-start gap-1.5">
                    <div className="w-1 h-1 bg-red-500 rounded-full mt-1.5 flex-shrink-0"></div>
                    <span className="text-xs italic">{traceLines.length - 3} more lines...</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

export default ErrorCard;
