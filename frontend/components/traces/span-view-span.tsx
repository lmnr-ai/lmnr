import { ChevronsDown, ChevronsUp } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { isChatMessageList } from "@/lib/flow/utils";
import { Span } from "@/lib/traces/types";

import Formatter from "../ui/formatter";
import { ScrollArea } from "../ui/scroll-area";
import ChatMessageListTab from "./chat-message-list-tab";

interface SpanViewSpanProps {
  span: Span;
}

export function SpanViewSpan({ span }: SpanViewSpanProps) {
  const [spanInput, setSpanInput] = useState(span.input);
  const [spanOutput, setSpanOutput] = useState(span.output);
  const [reversed, setReversed] = useState(false);

  if (span.inputUrl) {
    const url = span.inputUrl.startsWith("/") ? `${span.inputUrl}?payloadType=raw` : span.inputUrl;
    fetch(url).then((response) => {
      response.json().then((j) => {
        setSpanInput(j);
      });
    });
  }

  if (span.outputUrl) {
    const url = span.outputUrl.startsWith("/") ? `${span.outputUrl}?payloadType=raw` : span.outputUrl;
    fetch(url).then((response) => {
      response.json().then((j) => {
        setSpanOutput(j);
      });
    });
  }

  const pathKeyVal = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const pathKey = typeof pathKeyVal === "string" ? pathKeyVal.split(".") : pathKeyVal;

  return (
    <ScrollArea className="h-full mt-0">
      <div className="max-h-0">
        <div className="flex flex-col gap-4 h-full p-4 w-full">
          <div className="w-full">
            <div className="flex pb-2">
              <div className="font-medium text-lg mr-auto">Input</div>
              <Button variant="outline" onClick={() => setReversed((prev) => !prev)}>
                Reverse
                {reversed ? <ChevronsUp className="ml-2" size={16} /> : <ChevronsDown className="ml-2" size={16} />}
              </Button>
            </div>

            {isChatMessageList(spanInput) ? (
              <ChatMessageListTab
                reversed={reversed}
                messages={spanInput}
                presetKey={`input-${pathKey.join(".")}`}
              />
            ) : (
              <Formatter
                className="max-h-[400px]"
                collapsible
                value={typeof spanInput === "string" ? spanInput : JSON.stringify(spanInput)}
                presetKey={`input-${pathKey.join(".")}`}
              />
            )}
          </div>
          <div className="">
            <div className="pb-2 font-medium text-lg">Output</div>
            <Formatter
              className="max-h-[400px]"
              value={typeof spanOutput === "string" ? spanOutput : JSON.stringify(spanOutput)}
              presetKey={`output-${pathKey.join(".")}`}
              collapsible
            />
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
