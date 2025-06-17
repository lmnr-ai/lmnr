import React, { memo, PropsWithChildren, useEffect, useState } from "react";

import Messages from "@/components/traces/span-view/messages";
import { Span } from "@/lib/traces/types";

const SpanInput = ({ children, span }: PropsWithChildren<{ span: Span }>) => {
  const [spanInput, setSpanInput] = useState(span.input);

  useEffect(() => {
    if (span.inputUrl) {
      const url = span.inputUrl.startsWith("/") ? `${span.inputUrl}?payloadType=raw` : span.inputUrl;
      fetch(url).then((response) => {
        response.json().then((j) => {
          setSpanInput(j);
        });
      });
    }
  }, [span.inputUrl]);

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const spanPathArray = typeof spanPath === "string" ? spanPath.split(".") : spanPath;

  return (
    <Messages messages={spanInput} presetKey={`input-${spanPathArray.join(".")}`}>
      {children}
    </Messages>
  );
};

export default memo(SpanInput);
