import React, { memo, PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";

import Messages from "@/components/traces/span-view/messages";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { LangChainMessageSchema, LangChainMessagesSchema } from "@/lib/spans/types/langchain";
import { OpenAIMessageSchema, OpenAIMessagesSchema } from "@/lib/spans/types/openai";
import { Span } from "@/lib/traces/types";

interface SpanMessagesProps {
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

const SpanContent = ({ children, span, type }: PropsWithChildren<SpanMessagesProps>) => {
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

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const spanPathArray = typeof spanPath === "string" ? spanPath.split(".") : spanPath;
  const spanPathString = spanPathArray.join(".");

  // Check if data should be rendered as messages
  const shouldRenderAsMessages = useMemo(() => {
    if (!spanData) return false;

    // Try to parse as OpenAI or LangChain messages
    const openAIMessageResult = OpenAIMessageSchema.safeParse(spanData);
    const openAIResult = OpenAIMessagesSchema.safeParse(spanData);
    const langchainMessageResult = LangChainMessageSchema.safeParse(spanData);
    const langchainResult = LangChainMessagesSchema.safeParse(spanData);

    return openAIMessageResult.success || openAIResult.success || langchainMessageResult.success || langchainResult.success;
  }, [spanData]);

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
  if (shouldRenderAsMessages) {
    return (
      <ContentRenderer
        className="rounded border-0"
        readOnly
        codeEditorClassName="rounded-none border-none bg-background"
        value={JSON.stringify(spanData)}
        defaultMode="messages"
        modes={["MESSAGES", "JSON", "YAML", "TEXT"]}
        spanPath={spanPathString}
        spanType={type}
      >
        <Messages messages={spanData} spanPath={spanPathString} type={type}>
          {children}
        </Messages>
      </ContentRenderer>
    );
  }

  // Otherwise render as regular code
  return (
    <ContentRenderer
      className="rounded-none border-none bg-background"
      readOnly
      value={JSON.stringify(spanData)}
      defaultMode="messages"
    >
      <Messages messages={spanData} spanPath={spanPathString} type={type}>
        {children}
      </Messages>
    </ContentRenderer>
  );
};

export default memo(SpanContent);
