import { memo } from "react";

import { TextContentPart } from "@/components/traces/span-view/common";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { spanViewTheme } from "@/components/ui/content-renderer/utils";
import { resolveContentMode } from "@/lib/spans/resolve-content-mode";
import { preview, type TurnPart } from "@/lib/spans/turn-parts";

import ToolRow from "./tool-row";

interface PartProps {
  presetKey: string;
}

const Value = ({ value, presetKey }: PartProps & { value: unknown }) => {
  const { mode, modes, value: rendered } = resolveContentMode(value);
  return (
    <ContentRenderer
      readOnly
      defaultMode={mode}
      modes={modes}
      codeEditorClassName="rounded"
      value={rendered}
      presetKey={`editor-${presetKey}`}
      className="border-0"
      customTheme={spanViewTheme}
    />
  );
};

interface PartOptions {
  /** Open Thinking rows initially (the output's reasoning is what you came to read). */
  expandReasoning?: boolean;
}

interface PartViewProps extends PartProps, PartOptions {
  part: TurnPart;
  /** Collapsed rows don't mount the editor that would show the part's search matches. */
  hasMatches: boolean;
}

const Part = ({ part, expandReasoning, hasMatches, ...props }: PartViewProps) => {
  switch (part.kind) {
    case "text":
      return <TextContentPart content={part.text} {...props} />;
    case "reasoning":
      return (
        <ToolRow
          icon="reasoning"
          name="Thinking"
          summary={preview(part.text)}
          defaultOpen={expandReasoning}
          hasMatches={hasMatches}
        >
          <Value value={part.text} {...props} />
        </ToolRow>
      );
    case "tool-call":
      return (
        <ToolRow icon="call" name={part.name} summary={preview(part.args)} hasMatches={hasMatches}>
          <Value value={part.args} {...props} />
        </ToolRow>
      );
    case "tool-result":
      // The output only: the arguments are the call's, shown in its own message.
      return (
        <ToolRow
          icon="result"
          name={part.name ?? part.id ?? "result"}
          summary={preview(part.output)}
          hasMatches={hasMatches}
        >
          <Value value={part.output} {...props} />
        </ToolRow>
      );
  }
};

interface NormalizedPartsProps extends PartOptions {
  parts: TurnPart[];
  presetKey: string;
  messageIndex: number;
  /** Search match counts per part, from the row's search index. */
  hits?: readonly number[];
}

/** Tool calls, results and reasoning as one-line rows; the card's clamp handles long text. */
const NormalizedParts = ({ parts, presetKey, messageIndex, hits, ...options }: NormalizedPartsProps) =>
  parts.map((part, index) => (
    <Part
      key={index}
      part={part}
      {...options}
      presetKey={`${messageIndex}-${part.kind}-${index}-${presetKey}`}
      hasMatches={(hits?.[index] ?? 0) > 0}
    />
  ));

export default memo(NormalizedParts);
