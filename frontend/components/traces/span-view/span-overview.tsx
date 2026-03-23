import { ChevronDown } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MessageWrapper } from "@/components/traces/span-view/common";
import {
  buildToolNameMap,
  type ProcessedMessages,
  processMessages,
  renderMessageContent,
} from "@/components/traces/span-view/messages";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PAYLOAD_URL_REGEX } from "@/lib/actions/trace/utils";
import { useToast } from "@/lib/hooks/use-toast";
import { type Span } from "@/lib/traces/types";

const normalize = (data: unknown): unknown => {
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  return data;
};

const extractPayloadUrl = (data: unknown): string | null => {
  if (typeof data === "string") {
    const match = data.match(PAYLOAD_URL_REGEX);
    return match ? match[1] : null;
  }
  return null;
};

const fetchPayload = async (raw: unknown): Promise<unknown> => {
  const url = extractPayloadUrl(raw);
  if (!url) return raw;
  const fullUrl = url.startsWith("/") ? `${url}?payloadType=raw` : url;
  const response = await fetch(fullUrl);
  return response.json();
};

function OverviewMessages({ result, presetKey }: { result: ProcessedMessages; presetKey: string }) {
  const toolNameMap = useMemo(() => buildToolNameMap(result), [result]);
  return result.messages.map((message: any, i: number) => (
    <MessageWrapper
      key={`overview-${presetKey}-${i}`}
      role={message.role}
      presetKey={`collapse-${i}-${presetKey}`}
      maxHeight={560}
    >
      {renderMessageContent(result, i, presetKey, toolNameMap)}
    </MessageWrapper>
  ));
}

const SCROLL_THRESHOLD = 100;

const PureSpanOverview = ({ span }: { span: Span }) => {
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const [inputData, setInputData] = useState<unknown>(span.input);
  const [outputData, setOutputData] = useState<unknown>(span.output);
  const [isLoading, setIsLoading] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD);
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);

  const loadData = useCallback(async () => {
    const hasInputUrl = extractPayloadUrl(span.input);
    const hasOutputUrl = extractPayloadUrl(span.output);
    if (!hasInputUrl && !hasOutputUrl) return;

    try {
      setIsLoading(true);
      const [input, output] = await Promise.all([fetchPayload(span.input), fetchPayload(span.output)]);
      if (hasInputUrl) setInputData(input);
      if (hasOutputUrl) setOutputData(output);
    } catch {
      toast({ title: "Error", description: "Failed to load span data.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [span.input, span.output, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const inputResult = useMemo(() => {
    const normalized = normalize(inputData);
    const messages = Array.isArray(normalized) ? normalized : [];
    const lastTwo = messages.slice(-2);
    return lastTwo.length > 0 ? processMessages(lastTwo) : null;
  }, [inputData]);

  const outputResult = useMemo(() => {
    const normalized = normalize(outputData);
    return normalized != null ? processMessages(normalized) : null;
  }, [outputData]);

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const spanPathArray = typeof spanPath === "string" ? spanPath.split(".") : spanPath;
  const presetKey = `overview-${spanPathArray.join(".")}`;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-2">
        <Skeleton className="w-full h-8" />
        <Skeleton className="w-full h-8" />
        <Skeleton className="w-full h-8" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex flex-col w-full h-full overflow-y-auto styled-scrollbar divide-y"
      >
        {inputResult && (
          <div className="flex flex-col gap-2 px-2 pt-2 pb-4">
            <span className="text-base font-medium text-secondary-foreground px-1">
              Input <span className="text-sm text-muted-foreground">(last 2 messages)</span>
            </span>
            <div className="flex flex-col gap-4">
              <OverviewMessages result={inputResult} presetKey={`${presetKey}-input`} />
            </div>
          </div>
        )}
        {outputResult && (
          <div className="flex flex-col gap-2 px-2 pt-2 pb-4">
            <span className="text-base font-medium text-secondary-foreground px-1">Output</span>
            <div className="flex flex-col gap-4">
              <OverviewMessages result={outputResult} presetKey={`${presetKey}-output`} />
            </div>
          </div>
        )}
      </div>
      {!isAtBottom && (
        <Button
          aria-label="Scroll to bottom"
          size="icon"
          className="absolute bottom-3 right-3 rounded-full"
          onClick={scrollToBottom}
        >
          <ChevronDown className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
};

const SpanOverview = memo(PureSpanOverview);

export default SpanOverview;
