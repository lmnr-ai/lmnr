import React from "react";

import { TraceViewTrace } from "@/components/traces/trace-view/trace-view-store";
import ContentRenderer from "@/components/ui/content-renderer/index";

interface MetadataProps {
  trace: TraceViewTrace;
}

const Metadata = ({ trace }: MetadataProps) => {
  const metadataValue = trace.metadata || "{}";

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex-1">
        <ContentRenderer
          value={metadataValue}
          readOnly={true}
          defaultMode="json"
          className="h-full border-none"
          placeholder=""
        />
      </div>
    </div>
  );
};

export default Metadata;
