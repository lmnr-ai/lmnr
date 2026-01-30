import { FileText } from "lucide-react";
import React from "react";

import { Button } from "@/components/ui/button.tsx";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { cn } from "@/lib/utils.ts";

interface MetadataProps {
  metadata?: string;
}

const Metadata = ({ metadata }: MetadataProps) => {
  if (!metadata) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("h-6 text-xs px-1.5")}>
          <FileText size={14} className="mr-1" />
          <span>Metadata</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <div className="flex flex-col h-full w-full overflow-hidden bg-muted/30">
          <div className="flex-1">
            <ContentRenderer
              value={metadata}
              readOnly={true}
              defaultMode="json"
              className="h-full border-none"
              placeholder=""
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default Metadata;
