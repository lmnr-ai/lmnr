import React, { useEffect, useMemo, useState } from "react";

import ChatMessageListTab from "@/components/traces/chat-message-list-tab";
import { Span } from "@/lib/traces/types";
import { flattenContentOfMessages } from "@/lib/types";

const SpanInput = ({ span }: { span: Span }) => {
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

  const memoizedInput = useMemo(() => flattenContentOfMessages(spanInput), [spanInput]);

  return <ChatMessageListTab messages={memoizedInput} presetKey={`input-${spanPathArray.join(".")}`} />;
};

export default SpanInput;
