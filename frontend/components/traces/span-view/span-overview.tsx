import { memo, useMemo } from "react";
import useSWR from "swr";

import { type MessageLabel } from "@/components/traces/span-view/messages";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { spanViewTheme } from "@/components/ui/content-renderer/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { PAYLOAD_URL_REGEX } from "@/lib/actions/trace/utils";
import { useToast } from "@/lib/hooks/use-toast";
import { parseOpenAIOutput } from "@/lib/spans/types/openai";
import { type Span } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils.ts";

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

const PureSpanOverview = ({ span }: { span: Span }) => {
  const { toast } = useToast();

  const inputUrl = extractPayloadUrl(span.input);
  const outputUrl = extractPayloadUrl(span.output);
  const toFull = (u: string | null) => (u ? (u.startsWith("/") ? `${u}?payloadType=raw` : u) : null);
  const onError = () => toast({ title: "Error", description: "Failed to load span data.", variant: "destructive" });

  const { data: fetchedInput, isLoading: loadingInput } = useSWR(toFull(inputUrl), swrFetcher, {
    revalidateOnFocus: false,
    onError,
  });
  const { data: fetchedOutput, isLoading: loadingOutput } = useSWR(toFull(outputUrl), swrFetcher, {
    revalidateOnFocus: false,
    onError,
  });

  const inputData = inputUrl ? fetchedInput : span.input;
  const outputData = outputUrl ? fetchedOutput : span.output;
  const isLoading = (!!inputUrl && loadingInput) || (!!outputUrl && loadingOutput);

  // Overview = last 2 input messages stitched with the output, rendered through
  // the same ContentRenderer the I/O tabs use so users get the mode toggle
  // (MESSAGES / JSON / YAML / TEXT / CUSTOM) and search/copy/expand for free.
  const { mergedValue, messageLabels } = useMemo(() => {
    const input = normalize(inputData);
    const output = normalize(outputData);
    const inputArray = Array.isArray(input) ? input.slice(-2) : [];
    const openAIOutput = parseOpenAIOutput(output);
    const outputTail = openAIOutput ?? (output == null ? [] : Array.isArray(output) ? output : [output]);
    const labels: MessageLabel[] = [];
    if (inputArray.length > 0) {
      labels.push({
        beforeIndex: 0,
        text: "Input",
        subtext: inputArray.length === 1 ? "(last message)" : "(last 2 messages)",
      });
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
