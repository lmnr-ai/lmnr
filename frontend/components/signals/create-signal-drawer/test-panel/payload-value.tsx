"use client";

import { Check, X } from "lucide-react";

import { type SchemaField } from "@/components/signals/utils";
import { renderSpanReferences, type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import Markdown from "@/components/traces/trace-view/transcript/markdown.tsx";

export default function PayloadValue({
  value,
  field,
  spanRefCallbacks,
}: {
  value: unknown;
  field: SchemaField;
  spanRefCallbacks?: SpanReferenceCallbacks;
}) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }

  switch (field.type) {
    case "boolean":
      return (
        <span className="inline-flex items-center gap-1.5">
          {value ? <Check className="size-4 text-green-500" /> : <X className="size-4 text-muted-foreground" />}
          <span className="text-secondary-foreground">{value ? "true" : "false"}</span>
        </span>
      );
    case "enum":
      return (
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-secondary-foreground">
          {String(value)}
        </span>
      );
    case "number":
      return <span className="tabular-nums">{String(value)}</span>;
    case "string": {
      const text = String(value);
      // Test results carry the agent's raw `<span id=… />` refs, which Markdown would strip;
      // stored events get them rewritten to links server-side (`replace_span_tags_with_links`).
      const withRefs = spanRefCallbacks ? renderSpanReferences(text, spanRefCallbacks) : null;
      return (
        <span className="whitespace-pre-wrap break-words text-secondary-foreground">
          {withRefs ?? <Markdown contentClassName="pb-0" output={text} spanRefCallbacks={spanRefCallbacks} />}
        </span>
      );
    }
    default:
      return <span className="text-secondary-foreground">{String(value)}</span>;
  }
}
