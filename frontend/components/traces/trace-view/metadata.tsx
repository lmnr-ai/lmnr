import React from "react";

import ContentRenderer from "@/components/ui/content-renderer/index";

interface MetadataProps {
  metadata: string;
}

const Metadata = ({ metadata }: MetadataProps) => {
  const metadataValue = metadata || "{}";

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
