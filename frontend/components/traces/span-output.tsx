import React, { useState } from "react";

import ChatMessageListTab from "@/components/traces/chat-message-list-tab";
import Formatter from "@/components/ui/formatter";
import { isChatMessageList } from "@/lib/flow/utils";
import { Span } from "@/lib/traces/types";

const SpanOutput = ({ span }: { span: Span }) => {
  const [spanInput, setSpanInput] = useState(span.output);
  if (span.outputUrl) {
    const url = span.outputUrl.startsWith("/") ? `${span.outputUrl}?payloadType=raw` : span.outputUrl;
    fetch(url).then((response) => {
      response.json().then((j) => {
        setSpanInput(j);
      });
    });
  }

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const spanPathArray = typeof spanPath === "string" ? spanPath.split(".") : spanPath;

  return (
    <>
      {isChatMessageList(spanInput) ? (
        <ChatMessageListTab messages={spanInput} presetKey={`output-${spanPathArray.join(".")}`} />
      ) : (
        <Formatter
          className="max-h-[400px]"
          collapsible
          value={typeof spanInput === "string" ? spanInput : JSON.stringify(spanInput)}
          presetKey={`input-${spanPathArray.join(".")}`}
        />
      )}
    </>
  );
};

export default SpanOutput;
