import { memo, useMemo } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { buildOverview } from "@/components/traces/span-view/span-overview-utils";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { spanViewTheme } from "@/components/ui/content-renderer/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { PAYLOAD_URL_REGEX } from "@/lib/actions/trace/utils";
import { type Span } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils.ts";

const extractPayloadUrl = (data: unknown): string | null => {
  if (typeof data === "string") {
    const match = data.match(PAYLOAD_URL_REGEX);
    return match ? match[1] : null;
  }
  return null;
};

const PureSpanOverview = ({ span }: { span: Span }) => {

  const inputUrl = extractPayloadUrl(span.input);
  const outputUrl = extractPayloadUrl(span.output);
  const toFull = (u: string | null) => (u ? (u.startsWith("/") ? `${u}?payloadType=raw` : u) : null);
  const onError = () => toast.error("Error", { description: "Failed to load span data." });

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

  const { mergedValue, messageLabels, processedMessages } = useMemo(
    () => buildOverview(inputData, outputData),
    [inputData, outputData]
  );

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
      processedMessages={processedMessages}
    />
  );
};

const SpanOverview = memo(PureSpanOverview);

export default SpanOverview;
