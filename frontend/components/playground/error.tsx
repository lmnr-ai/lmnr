import { ChevronRight, CircleAlert } from "lucide-react";
import React from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const Error = ({ error }: { error: Error }) => (
  <Collapsible className="group mb-2">
    <div className="border bg-card rounded-md text-destructive max-h-48 overflow-y-auto">
      <CollapsibleTrigger className="flex items-start gap-2 w-full p-2 text-left rounded-md">
        <CircleAlert className="w-4 h-4" />
        <div className="flex flex-1 items-center justify-between">
          <div>
            <h3 className="font-medium text-xs">{error.name}</h3>
            <p className="text-xs mt-0.5">
              {error.message.substring(0, 60)}${error.message.length > 60 ? "..." : ""}
            </p>
          </div>
          <div className="self-start mt-2.5 text-muted-foreground ml-2">
            <ChevronRight className="w-4 h-4 text-muted-foreground mr-2 group-data-[state=open]:rotate-90 transition-transform duration-200" />
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-2 pb-2 ml-6">
        {error.message && (
          <div className="mb-2">
            <p className="text-muted-foreground text-xs mb-1">Full error details:</p>
            <div className="bg-muted rounded-sm p-2 border">
              <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">{error.message}</pre>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </div>
  </Collapsible>
);

export default Error;
