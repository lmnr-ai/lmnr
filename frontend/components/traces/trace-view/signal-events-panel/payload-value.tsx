import { type SchemaField } from "@/components/signals/utils";
import { type SpanReferenceCallbacks } from "@/components/traces/trace-view/span-reference";
import Markdown from "@/components/traces/trace-view/transcript/markdown.tsx";

import EnumPill from "./enum-pill";

interface Props {
  value: unknown;
  field: SchemaField;
  spanRefCallbacks?: SpanReferenceCallbacks;
}

/** One payload value, rendered per its schema type. */
export default function PayloadValue({ value, field, spanRefCallbacks }: Props) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }
  switch (field.type) {
    case "boolean":
      return <span>{value ? "true" : "false"}</span>;
    case "enum":
      return <EnumPill value={String(value)} />;
    case "number":
      return <span className="tabular-nums">{String(value)}</span>;
    case "string":
      return (
        <span className="whitespace-pre-wrap break-words">
          <Markdown contentClassName="pb-0" output={String(value)} spanRefCallbacks={spanRefCallbacks} />
        </span>
      );
  }
}
