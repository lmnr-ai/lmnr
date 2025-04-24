import { useState } from "react";

import ChatMessageListTab from "@/components/traces/chat-message-list-tab";
import Formatter from "@/components/ui/formatter";
import { isChatMessageList } from "@/lib/flow/utils";
import { Span } from "@/lib/traces/types";

const SpanOutput = ({ span }: { span: Span }) => {
  const [spanOutput, setSpanOutput] = useState(span.output);

  if (span.outputUrl) {
    const url = span.outputUrl.startsWith("/") ? `${span.outputUrl}?payloadType=raw` : span.outputUrl;
    fetch(url).then((response) => {
      response.json().then((j) => {
        setSpanOutput(j);
      });
    });
  }

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const spanPathArray = typeof spanPath === "string" ? spanPath.split(".") : spanPath;

  return (
    <div className="h-full p-4 overflow-auto">
      {isChatMessageList(spanOutput) ? (
        <ChatMessageListTab messages={spanOutput} />
      ) : (
        <Formatter
          className="max-h-[400px]"
          collapsible
          value={typeof spanOutput === "string" ? spanOutput : JSON.stringify(spanOutput)}
          presetKey={`output-${spanPathArray.join(".")}`}
        />
      )}
    </div>
  );
};

export default SpanOutput;
