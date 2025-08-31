import React, { memo, PropsWithChildren, useEffect, useState } from "react";

import Messages from "@/components/traces/span-view/messages";
import { Span } from "@/lib/traces/types";

interface SpanMessagesProps {
  span: Span;
  type: "input" | "output";
}

const SpanContent = ({ children, span, type }: PropsWithChildren<SpanMessagesProps>) => {
  const initialData = type === "input" ? span.input : span.output;
  const [spanData, setSpanData] = useState(initialData);

  useEffect(() => {
    const url = type === "input" ? span.inputUrl : span.outputUrl;
    if (url) {
      const fullUrl = url.startsWith("/") ? `${url}?payloadType=raw` : url;
      fetch(fullUrl).then((response) => {
        response.json().then((j) => {
          setSpanData(j);
        });
      });
    }
  }, [span.inputUrl, span.outputUrl, type]);

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const spanPathArray = typeof spanPath === "string" ? spanPath.split(".") : spanPath;
  const spanPathString = spanPathArray.join(".");

  return (
    <Messages messages={spanData} spanPath={spanPathString} type={type}>
      {children}
    </Messages>
  );
};

export default memo(SpanContent);
