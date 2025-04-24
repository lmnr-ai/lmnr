import React, { useState } from "react";

import ChatMessageListTab from "@/components/traces/chat-message-list-tab";
import Formatter from "@/components/ui/formatter";
import { isChatMessageList } from "@/lib/flow/utils";
import { Span } from "@/lib/traces/types";

const SpanInput = ({ span }: { span: Span }) => {
  const [spanInput, setSpanInput] = useState(span.input);

  if (span.inputUrl) {
    const url = span.inputUrl.startsWith("/") ? `${span.inputUrl}?payloadType=raw` : span.inputUrl;
    fetch(url).then((response) => {
      response.json().then((j) => {
        setSpanInput(j);
      });
    });
  }

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const spanPathArray = typeof spanPath === "string" ? spanPath.split(".") : spanPath;

  return (
    <div className="h-full p-4 overflow-auto">
      {isChatMessageList(spanInput) ? (
        <ChatMessageListTab messages={spanInput} />
      ) : (
        <Formatter
          className="max-h-[400px]"
          collapsible
          value={typeof spanInput === "string" ? spanInput : JSON.stringify(spanInput)}
          presetKey={`input-${spanPathArray.join(".")}`}
        />
      )}
    </div>
  );
};

export default SpanInput;
