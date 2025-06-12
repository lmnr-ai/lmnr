import React, { useEffect, useMemo, useState } from "react";

import Messages from "@/components/traces/span-view/messages";
import { Span } from "@/lib/traces/types";
import { ChatMessage, flattenContentOfMessages } from "@/lib/types";

const SpanOutput = ({ span }: { span: Span }) => {
  const [spanOutput, setSpanOutput] = useState<ChatMessage[]>(span.output);

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

  const memoizedOutput = useMemo(() => flattenContentOfMessages(spanOutput), [spanOutput]);

  return <Messages messages={memoizedOutput} presetKey={`output-${spanPathArray.join(".")}`} />;
};

export default SpanOutput;
