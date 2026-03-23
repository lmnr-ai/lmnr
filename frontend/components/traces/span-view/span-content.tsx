import React, { memo, useCallback, useEffect, useMemo, useState } from "react";

import ShikiContentRenderer from "@/components/ui/content-renderer/shiki-renderer";
import { Skeleton } from "@/components/ui/skeleton";
import { PAYLOAD_URL_REGEX } from "@/lib/actions/trace/utils";
import { useToast } from "@/lib/hooks/use-toast.ts";
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

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-2 justify-center items-center">
        <Skeleton className="w-full h-8" />
        <Skeleton className="w-full h-8" />
        <Skeleton className="w-full h-8" />
      </div>
    );
  }

  if (span.spanType === SpanType.LLM) {
    return (
      <ShikiContentRenderer
        className="rounded border-0"
        codeEditorClassName="rounded-none border-none bg-background"
        value={JSON.stringify(normalizedData)}
        defaultMode="messages"
        modes={["MESSAGES", "JSON", "YAML", "TEXT", "CUSTOM"]}
        presetKey={presetKey}
        messageMaxHeight={type === "input" ? 320 : 560}
      />
    );
  }

  return (
    <ShikiContentRenderer
      className="rounded-none border-none bg-background"
      modes={["JSON", "YAML", "TEXT", "CUSTOM", "MESSAGES"]}
      value={JSON.stringify(normalizedData)}
      presetKey={presetKey}
      defaultMode="json"
    />
  );
};

export default memo(SpanContent);
