import { memo, useMemo } from "react";

import ContentRenderer from "@/components/ui/content-renderer/index";
import { spanViewTheme } from "@/components/ui/content-renderer/utils";
import { normalizeSpanPayload } from "@/lib/spans/turn";
import { type Span } from "@/lib/traces/types";

const MODES = ["JSON", "YAML", "TEXT", "CUSTOM"];

interface SpanIOSectionProps {
  title: string;
  data: unknown;
  presetKey: string;
  index: number;
}

/** Per-span-path key for remembered formats and templates. */
export const spanPathKey = (span: Span) => {
  const path = span.attributes?.["lmnr.span.path"] ?? [span.name];
  return (typeof path === "string" ? path.split(".") : path).join(".");
};

export const SpanIOSection = ({ title, data, presetKey, index }: SpanIOSectionProps) => {
  const value = useMemo(() => JSON.stringify(normalizeSpanPayload(data)) ?? "null", [data]);
  return (
    <div className="flex flex-col pt-2">
      {/* No contain-strict: size containment would collapse the auto-height editor. */}
      <ContentRenderer
        header={<span className="pl-1 text-base font-medium text-secondary-foreground">{title}</span>}
        className="rounded-none border-0"
        codeEditorClassName="rounded-none border-none"
        readOnly
        value={value}
        defaultMode="json"
        modes={MODES}
        presetKey={presetKey}
        customTheme={spanViewTheme}
        messageIndex={index}
      />
    </div>
  );
};

const PureSpanIO = ({ span }: { span: Span }) => {
  const pathKey = spanPathKey(span);
  return (
    <div className="size-full overflow-y-auto styled-scrollbar scrollbar-gutter-stable divide-y">
      <SpanIOSection title="Input" data={span.input} presetKey={`input-${pathKey}`} index={0} />
      <SpanIOSection title="Output" data={span.output} presetKey={`output-${pathKey}`} index={1} />
    </div>
  );
};

const SpanIO = memo(PureSpanIO);

export default SpanIO;
