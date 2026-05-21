import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { type MessageLabel } from "@/components/traces/span-view/messages";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { spanViewTheme } from "@/components/ui/content-renderer/utils";
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

const PureSpanOverview = ({ span }: { span: Span }) => {
  const { toast } = useToast();

  const [inputData, setInputData] = useState<unknown>(span.input);
  const [outputData, setOutputData] = useState<unknown>(span.output);
  const [isLoading, setIsLoading] = useState(false);

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

  // Overview = last 2 input messages stitched with the output, rendered through
  // the same ContentRenderer the I/O tabs use so users get the mode toggle
  // (MESSAGES / JSON / YAML / TEXT / CUSTOM) and search/copy/expand for free.
  const { mergedValue, messageLabels } = useMemo(() => {
    const input = normalize(inputData);
    const output = normalize(outputData);
    const inputArray = Array.isArray(input) ? input.slice(-2) : [];
    const outputTail = output == null ? [] : Array.isArray(output) ? output : [output];
    const labels: MessageLabel[] = [];
    if (inputArray.length > 0) {
      labels.push({ beforeIndex: 0, text: "Input", subtext: "(last 2 messages)" });
    }
    if (outputTail.length > 0) {
      labels.push({ beforeIndex: inputArray.length, text: "Output" });
    }
    return {
      mergedValue: JSON.stringify([...inputArray, ...outputTail]),
      messageLabels: labels,
    };
  }, [inputData, outputData]);

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const spanPathString = (typeof spanPath === "string" ? spanPath.split(".") : spanPath).join(".");
  const presetKey = `overview-${spanPathString}`;

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
    <ContentRenderer
      className="rounded-none border-0"
      codeEditorClassName="rounded-none border-none bg-background contain-strict"
      readOnly
      value={mergedValue}
      defaultMode="messages"
      modes={["MESSAGES", "JSON", "YAML", "TEXT", "CUSTOM"]}
      presetKey={presetKey}
      customTheme={spanViewTheme}
      messageMaxHeight={560}
      messageLabels={messageLabels}
    />
  );
};

const SpanOverview = memo(PureSpanOverview);

export default SpanOverview;
