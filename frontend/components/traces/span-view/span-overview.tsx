import { memo, useMemo } from "react";

import Messages from "@/components/traces/span-view/messages";
import { buildOverview } from "@/components/traces/span-view/span-overview-utils";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { spanViewTheme } from "@/components/ui/content-renderer/utils";
import { type Span } from "@/lib/traces/types";
import { tryParseJson } from "@/lib/utils.ts";

const PureSpanOverview = ({ span }: { span: Span }) => {
  const { mergedValue, messageLabels, processedMessages } = useMemo(
    () => buildOverview(span.input, span.output),
    [span.input, span.output]
  );

  const spanPath = span.attributes?.["lmnr.span.path"] ?? [span.name];
  const spanPathString = (typeof spanPath === "string" ? spanPath.split(".") : spanPath).join(".");
  const presetKey = `overview-${spanPathString}`;

  return (
    <ContentRenderer
      className="rounded-none border-0"
      codeEditorClassName="rounded-none border-none contain-strict"
      readOnly
      value={mergedValue}
      defaultMode="messages"
      modes={["MESSAGES", "JSON", "YAML", "TEXT", "CUSTOM"]}
      presetKey={presetKey}
      customTheme={spanViewTheme}
      renderMessages={(ctx) => (
        <Messages
          messages={tryParseJson(ctx.value) ?? []}
          processed={processedMessages}
          presetKey={ctx.presetKey}
          maxHeight={560}
          labels={messageLabels}
          expandFromIndex={messageLabels.find((label) => label.text === "Output")?.beforeIndex}
        />
      )}
    />
  );
};

const SpanOverview = memo(PureSpanOverview);

export default SpanOverview;
