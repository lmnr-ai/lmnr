import React from "react";

import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { TraceViewTrace } from "@/components/traces/trace-view/trace-view-store";

interface MetadataProps {
  trace: TraceViewTrace;
}

const Metadata = ({ trace }: MetadataProps) => {
  const metadataValue = trace.metadata || "{}";

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex-1">
        <CodeHighlighter
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
