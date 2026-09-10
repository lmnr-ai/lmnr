import React, { memo, useMemo } from "react";

import Messages from "@/components/traces/span-view/messages";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { spanViewTheme } from "@/components/ui/content-renderer/utils";
import { type Span, SpanType } from "@/lib/traces/types";
import { tryParseJson } from "@/lib/utils";

interface SpanContentProps {
  span: Span;
  type: "input" | "output";
}

const SpanContent = ({ span, type }: SpanContentProps) => {
  const spanData = type === "input" ? span.input : span.output;

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

  if (span.spanType === SpanType.LLM) {
    return (
      <ContentRenderer
        className="rounded border-0"
        readOnly
        codeEditorClassName="rounded-none border-none bg-background contain-strict"
        value={JSON.stringify(normalizedData)}
        defaultMode="messages"
        modes={["MESSAGES", "JSON", "YAML", "TEXT", "CUSTOM"]}
        presetKey={presetKey}
        customTheme={spanViewTheme}
        renderMessages={(ctx) => (
          <Messages
            messages={tryParseJson(ctx.value) ?? []}
            presetKey={ctx.presetKey}
            maxHeight={type === "input" ? 320 : 560}
          />
        )}
      />
    );
  }

  return (
    <ContentRenderer
      className="rounded-none border-none bg-background"
      codeEditorClassName="rounded-none border-none bg-background contain-strict"
      readOnly
      modes={["JSON", "YAML", "TEXT", "CUSTOM"]}
      value={JSON.stringify(normalizedData)}
      presetKey={presetKey}
      defaultMode="json"
      customTheme={spanViewTheme}
    />
  );
};

export default memo(SpanContent);
