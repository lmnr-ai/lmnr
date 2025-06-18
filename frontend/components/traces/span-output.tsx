import React, { memo, PropsWithChildren, useEffect, useState } from "react";

import Messages from "@/components/traces/span-view/messages";
import { Span } from "@/lib/traces/types";

const SpanOutput = ({ children, span }: PropsWithChildren<{ span: Span }>) => {
  const [spanOutput, setSpanOutput] = useState(span.output);

  useEffect(() => {
    if (span.outputUrl) {
      const url = span.outputUrl.startsWith("/") ? `${span.outputUrl}?payloadType=raw` : span.outputUrl;
      fetch(url).then((response) => {
        response.json().then((j) => {
          setSpanOutput(j);
        });
      });
    }
  }, [span.outputUrl]);

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const spanPathArray = typeof spanPath === "string" ? spanPath.split(".") : spanPath;

  return (
    <Messages messages={spanOutput} presetKey={`output-${spanPathArray.join(".")}`}>
      {children}
    </Messages>
  );
};

export default memo(SpanOutput);
