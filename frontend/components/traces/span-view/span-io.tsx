import { memo, useMemo } from "react";

import MessageLabelRow from "@/components/traces/span-view/message-label-row";
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

const SpanIOSection = ({ title, data, presetKey, index }: SpanIOSectionProps) => {
  const value = useMemo(() => JSON.stringify(normalizeSpanPayload(data)) ?? "null", [data]);
  return (
    <div className="flex flex-col">
      <div className="px-3 pt-2">
        <MessageLabelRow text={title} />
      </div>
      {/* No contain-strict: size containment would collapse the auto-height editor. */}
      <ContentRenderer
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
  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const pathKey = (typeof spanPath === "string" ? spanPath.split(".") : spanPath).join(".");

  return (
    <div className="size-full overflow-y-auto styled-scrollbar scrollbar-gutter-stable divide-y">
      <SpanIOSection title="Input" data={span.input} presetKey={`input-${pathKey}`} index={0} />
      <SpanIOSection title="Output" data={span.output} presetKey={`output-${pathKey}`} index={1} />
    </div>
  );
};

const SpanIO = memo(PureSpanIO);

export default SpanIO;
