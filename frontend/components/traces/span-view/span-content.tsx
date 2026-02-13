import React, { memo, useCallback, useEffect, useMemo, useState } from "react";

import { useSpanSearchContext } from "@/components/traces/span-view/span-search-context";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { Skeleton } from "@/components/ui/skeleton";
import { PAYLOAD_URL_REGEX } from "@/lib/actions/trace/utils";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { GeminiInputSchema, GeminiOutputSchema } from "@/lib/spans/types/gemini";
import { LangChainMessageSchema, LangChainMessagesSchema } from "@/lib/spans/types/langchain";
import { OpenAIMessageSchema, OpenAIMessagesSchema } from "@/lib/spans/types/openai";
import { type Span, SpanType } from "@/lib/traces/types";

interface SpanContentProps {
  span: Span;
  type: "input" | "output";
}

const extractPayloadUrl = (data: any): string | null => {
  if (typeof data === "string") {
    const match = data.match(PAYLOAD_URL_REGEX);
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

  // Normalize spanData: unwrap double-serialized strings (e.g. Gemini output is stored
  // as serde_json::to_string → serde_json::to_value, resulting in Value::String("..."))
  const normalizedData = useMemo(() => {
    if (typeof spanData === "string") {
      try {
        return JSON.parse(spanData);
      } catch {
        return spanData;
      }
    }
    return spanData;
  }, [spanData]);

  // Check if data should be rendered as messages
  const shouldRenderAsMessages = useMemo(() => {
    if (!normalizedData) return false;

    // Try to parse as OpenAI, LangChain, or Gemini messages
    const openAIMessageResult = OpenAIMessageSchema.safeParse(normalizedData);
    const openAIMessagesResult = OpenAIMessagesSchema.safeParse(normalizedData);
    const langchainMessageResult = LangChainMessageSchema.safeParse(normalizedData);
    const langchainMessagesResult = LangChainMessagesSchema.safeParse(normalizedData);
    return (
      openAIMessageResult.success ||
      openAIMessagesResult.success ||
      langchainMessageResult.success ||
      langchainMessagesResult.success ||
      GeminiOutputSchema.safeParse(normalizedData).success ||
      GeminiInputSchema.safeParse(normalizedData).success
    );
  }, [normalizedData]);

  const searchContext = useSpanSearchContext();

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
        value={JSON.stringify(normalizedData)}
        defaultMode="messages"
        modes={["MESSAGES", "JSON", "YAML", "TEXT", "CUSTOM"]}
        presetKey={presetKey}
        searchTerm={searchContext?.searchTerm || ""}
      />
    );
  }

  // Otherwise render as regular code
  return (
    <ContentRenderer
      className="rounded-none border-none bg-background"
      readOnly
      modes={["JSON", "YAML", "TEXT", "CUSTOM", "MESSAGES"]}
      value={JSON.stringify(normalizedData)}
      presetKey={presetKey}
      defaultMode={span.spanType === SpanType.LLM ? "messages" : "json"}
      searchTerm={searchContext?.searchTerm || ""}
    />
  );
};

export default memo(SpanContent);
