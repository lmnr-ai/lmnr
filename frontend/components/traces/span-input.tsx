import React, { memo, useEffect, useMemo, useState } from "react";

import Messages from "@/components/traces/span-view/messages";
import { convertOpenAIToChatMessages, OpenAIMessagesSchema } from "@/lib/spans/types";
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

  const memoizedInput = useMemo(() => {
    const result = OpenAIMessagesSchema.safeParse(spanInput);
    if (result.success) {
      return convertOpenAIToChatMessages(result.data);
    }
    return flattenContentOfMessages(spanInput);
  }, [spanInput]);

  return <Messages messages={memoizedInput} presetKey={`input-${spanPathArray.join(".")}`} />;
};

export default memo(SpanInput);
