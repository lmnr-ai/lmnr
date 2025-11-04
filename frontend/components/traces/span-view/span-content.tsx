import React, { memo, useCallback, useEffect, useMemo, useState } from "react";

import ContentRenderer from "@/components/ui/content-renderer/index";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { LangChainMessageSchema, LangChainMessagesSchema } from "@/lib/spans/types/langchain";
import { OpenAIMessageSchema, OpenAIMessagesSchema } from "@/lib/spans/types/openai";
import { Span, SpanType } from "@/lib/traces/types";

import { useOptionalTraceViewStoreContext } from "../trace-view/trace-view-store";

interface SpanContentProps {
  span: Span;
  type: "input" | "output";
}

const extractPayloadUrl = (data: any): string | null => {
  if (typeof data === "string") {
    const match = data.match(/<lmnr_payload_url>(.*?)<\/lmnr_payload_url>/);
    return match ? match[1] : null;
  }
  return null;
};

const SpanContent = ({ span, type }: SpanContentProps) => {
  const initialData = type === "input" ? span.input : span.output;
  const { toast } = useToast();
  const [spanData, setSpanData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    const rawData = type === "input" ? span.input : span.output;
    const url = extractPayloadUrl(rawData);

    if (url) {
      try {
        setIsLoading(true);
        const fullUrl = url.startsWith("/") ? `${url}?payloadType=raw` : url;
        const response = await fetch(fullUrl);
        const data = await response.json();
        setSpanData(data);
      } catch (e) {
        toast({ title: "Error", description: "Failed to load span data.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    }
  }, [span.input, span.output, toast, type]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Create preset key that includes the type
  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const spanPathArray = typeof spanPath === "string" ? spanPath.split(".") : spanPath;
  const spanPathString = spanPathArray.join(".");
  const presetKey = `${type}-${spanPathString}`;

  // Check if data should be rendered as messages
  const shouldRenderAsMessages = useMemo(() => {
    if (!spanData) return false;

    // Try to parse as OpenAI or LangChain messages
    const openAIMessageResult = OpenAIMessageSchema.safeParse(spanData);
    const openAIMessagesResult = OpenAIMessagesSchema.safeParse(spanData);
    const langchainMessageResult = LangChainMessageSchema.safeParse(spanData);
    const langchainMessagesResult = LangChainMessagesSchema.safeParse(spanData);

    return (
      openAIMessageResult.success ||
      openAIMessagesResult.success ||
      langchainMessageResult.success ||
      langchainMessagesResult.success
    );
  }, [spanData]);

  const { search } = useOptionalTraceViewStoreContext(
    (state) => ({
      search: state.search,
    }),
    { search: "" }
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-2 justify-center items-center">
        <Skeleton className="w-full h-8" />
        <Skeleton className="w-full h-8" />
        <Skeleton className="w-full h-8" />
      </div>
    );
  }

  // Render as messages if it matches message schema
  if (shouldRenderAsMessages && span.spanType === SpanType.LLM) {
    return (
      <ContentRenderer
        className="rounded border-0"
        readOnly
        codeEditorClassName="rounded-none border-none bg-background"
        value={JSON.stringify(spanData)}
        defaultMode="messages"
        modes={["MESSAGES", "JSON", "YAML", "TEXT", "CUSTOM"]}
        presetKey={presetKey}
        searchTerm={search}
      />
    );
  }

  // Otherwise render as regular code
  return (
    <ContentRenderer
      className="rounded-none border-none bg-background"
      readOnly
      modes={["JSON", "YAML", "TEXT", "CUSTOM", "MESSAGES"]}
      value={JSON.stringify(spanData)}
      presetKey={presetKey}
      defaultMode={span.spanType === SpanType.LLM ? "messages" : "json"}
      searchTerm={search}
    />
  );
};

export default memo(SpanContent);
