import { Loader } from "lucide-react";
import React, { memo, PropsWithChildren, useCallback, useEffect, useState } from "react";

import Messages from "@/components/traces/span-view/messages";
import { useToast } from "@/lib/hooks/use-toast.ts";
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

  if (isLoading) {
    return (
      <div className="flex pt-8 justify-center items-center">
        <Loader className="animate-spin w-4 h-4" />
      </div>
    );
  }

  return (
    <Messages messages={spanData} spanPath={spanPathString} type={type}>
      {children}
    </Messages>
  );
};

export default memo(SpanContent);
