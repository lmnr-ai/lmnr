import { CornerDownRight } from "lucide-react";
import { memo } from "react";

import {
  TextContentPart,
  ThinkingContentPart,
  ToolCallContentPart,
  ToolResultContentPart,
} from "@/components/traces/span-view/common";
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

const CompactPart = ({
  part,
  resultPreviews,
  plainResults,
  expandReasoning,
  ...props
}: PartProps & { part: TurnPart; resultPreviews?: boolean; plainResults?: boolean; expandReasoning?: boolean }) => {
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
      return resultPreviews || plainResults ? (
        <ResultPreview part={part} plain={plainResults}>
          {body}
        </ResultPreview>
      ) : (
        <ToolRow icon="result" name={part.name ?? part.id ?? "result"} summary={part.preview}>
          {body}
        </ToolRow>
      );
    }
  }
};

const FullPart = ({
  part,
  presetKey,
  messageIndex,
  contentPartIndex,
}: PartProps & { part: TurnPart; resultPreviews?: boolean; plainResults?: boolean; expandReasoning?: boolean }) => {
  const common = { presetKey, messageIndex, contentPartIndex };
  switch (part.kind) {
    case "text":
      return <TextContentPart content={part.text} {...common} />;
    case "reasoning":
      return <ThinkingContentPart content={part.text} {...common} />;
    case "tool-call":
      return (
        <div className="flex flex-col">
          <ToolCallContentPart toolName={part.name} toolCallId={part.id} content={part.args} {...common} />
          {part.result && (
            <div className="ml-4 border-l">
              <ToolResultContentPart
                toolCallId="Result"
                toolName="Result"
                content={part.result.output}
                presetKey={`result-${presetKey}`}
                messageIndex={messageIndex}
                contentPartIndex={contentPartIndex + 1}
              />
            </div>
          )}
        </div>
      );
    case "tool-result":
      return (
        <ToolResultContentPart
          toolCallId={part.id ?? part.name ?? "-"}
          toolName={part.name}
          content={part.output}
          {...common}
        />
      );
  }
};

interface NormalizedPartsProps {
  parts: TurnPart[];
  compact: boolean;
  /** Compact only: tool results as clamped content previews instead of one-line rows. */
  resultPreviews: boolean;
  /** Results as plain indented previews instead of bordered boxes. */
  plainResults?: boolean;
  /** Compact only: open Thinking rows initially (the output's reasoning is what you came to read). */
  expandReasoning?: boolean;
  presetKey: string;
  messageIndex: number;
}

const NormalizedParts = ({
  parts,
  compact,
  resultPreviews,
  plainResults,
  expandReasoning,
  presetKey,
  messageIndex,
}: NormalizedPartsProps) => {
  const Part = compact ? CompactPart : FullPart;
  return parts.map((part, index) => (
    <Part
      key={index}
      part={part}
      resultPreviews={resultPreviews}
      plainResults={plainResults}
      expandReasoning={expandReasoning}
      presetKey={`${messageIndex}-${part.kind}-${index}-${presetKey}`}
      messageIndex={messageIndex}
      // Even slots for parts, odd for a paired result, so search order follows reading order.
      contentPartIndex={index * 2}
    />
  ));
};

export default memo(NormalizedParts);
