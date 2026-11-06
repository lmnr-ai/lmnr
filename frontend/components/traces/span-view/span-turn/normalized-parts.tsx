import { CornerDownRight } from "lucide-react";
import { memo } from "react";

import { TextContentPart } from "@/components/traces/span-view/common";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { spanViewTheme } from "@/components/ui/content-renderer/utils";
import { resolveContentMode } from "@/lib/spans/resolve-content-mode";
import { type ToolResultPart, type TurnPart } from "@/lib/spans/turn-parts";

import ResultPreview from "./result-preview";
import ToolRow from "./tool-row";

interface PartProps {
  presetKey: string;
  messageIndex: number;
  contentPartIndex: number;
}

const Value = ({
  title,
  value,
  presetKey,
  messageIndex,
  contentPartIndex,
}: PartProps & { title?: string; value: unknown }) => {
  const { mode, modes, value: rendered } = resolveContentMode(value);
  return (
    <div className="flex flex-col gap-1">
      {title && <span className="text-xs text-muted-foreground">{title}</span>}
      <ContentRenderer
        readOnly
        defaultMode={mode}
        modes={modes}
        codeEditorClassName="rounded"
        value={rendered}
        presetKey={`editor-${presetKey}`}
        className="border-0"
        messageIndex={messageIndex}
        contentPartIndex={contentPartIndex}
        customTheme={spanViewTheme}
      />
    </div>
  );
};

const ResultSummary = ({ result }: { result: ToolResultPart }) => (
  <span className="flex items-center gap-1.5 pl-5 min-w-0 text-muted-foreground">
    <CornerDownRight size={12} className="min-w-3" />
    <span className="truncate font-mono">{result.preview}</span>
  </span>
);

const Part = ({
  part,
  plainResults,
  expandReasoning,
  ...props
}: PartProps & { part: TurnPart; plainResults?: boolean; expandReasoning?: boolean }) => {
  switch (part.kind) {
    case "text":
      return <TextContentPart content={part.text} {...props} />;
    case "reasoning":
      return (
        <ToolRow icon="reasoning" name="Thinking" summary={part.preview} defaultOpen={expandReasoning}>
          <Value value={part.text} {...props} />
        </ToolRow>
      );
    case "tool-call":
      return (
        <ToolRow
          icon="call"
          name={part.name}
          summary={part.preview}
          detail={part.result && <ResultSummary result={part.result} />}
        >
          <Value title="Arguments" value={part.args} {...props} />
          {part.result && (
            <Value
              title="Result"
              value={part.result.output}
              {...props}
              presetKey={`result-${props.presetKey}`}
              contentPartIndex={props.contentPartIndex + 1}
            />
          )}
        </ToolRow>
      );
    case "tool-result": {
      const body = (
        <>
          {part.call && (
            <Value
              title="Called with"
              value={part.call.args}
              {...props}
              presetKey={`call-${props.presetKey}`}
              contentPartIndex={props.contentPartIndex + 1}
            />
          )}
          <Value title="Result" value={part.output} {...props} />
        </>
      );
      return plainResults ? (
        <ResultPreview part={part}>{body}</ResultPreview>
      ) : (
        <ToolRow icon="result" name={part.name ?? part.id ?? "result"} summary={part.preview}>
          {body}
        </ToolRow>
      );
    }
  }
};

interface NormalizedPartsProps {
  parts: TurnPart[];
  /** This call's tool results: their output's first lines instead of one-line rows. */
  plainResults?: boolean;
  /** Open Thinking rows initially (the output's reasoning is what you came to read). */
  expandReasoning?: boolean;
  presetKey: string;
  messageIndex: number;
}

const NormalizedParts = ({ parts, plainResults, expandReasoning, presetKey, messageIndex }: NormalizedPartsProps) =>
  parts.map((part, index) => (
    <Part
      key={index}
      part={part}
      plainResults={plainResults}
      expandReasoning={expandReasoning}
      presetKey={`${messageIndex}-${part.kind}-${index}-${presetKey}`}
      messageIndex={messageIndex}
      // Even slots for parts, odd for a paired result, so search order follows reading order.
      contentPartIndex={index * 2}
    />
  ));

export default memo(NormalizedParts);
