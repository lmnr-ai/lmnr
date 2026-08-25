import { memo } from "react";

import { cn } from "@/lib/utils";

import { type MockSpan } from "../../demo-trace";
import PreviewText from "./preview-text";
import SpanStats from "./span-stats";
import SpanTypeIcon from "./span-type-icon";

interface Props {
  span: MockSpan;
  isSelected: boolean;
  onSelect: (spanId: string) => void;
}

// One transcript row. Where the output goes is the whole difference between the
// two shapes: a tool result sits inline beside the name, an LLM's gets its own
// line beneath — which is why the run reads as alternating short and tall rows.
const SpanRow = ({ span, isSelected, onSelect }: Props) => {
  const isLLM = span.spanType === "LLM";
  const displayName = isLLM && span.model ? span.model : span.name;

  return (
    <div
      onClick={() => onSelect(span.spanId)}
      className={cn(
        "flex group/message cursor-pointer transition-all border-l-2 hover:bg-secondary",
        isSelected ? "bg-primary/15 border-l-primary hover:bg-primary/20" : "border-l-transparent"
      )}
    >
      <div className="flex flex-col flex-1 min-w-0 py-1.5 gap-1 pl-1.5 pr-2">
        <div className="flex gap-2 items-center min-w-0">
          <SpanTypeIcon span={span} className="shrink-0" />

          {isLLM ? (
            <span className="font-medium text-[13px] whitespace-nowrap truncate">{displayName}</span>
          ) : (
            <div className="flex flex-1 gap-2 items-center min-w-0">
              <span className="font-medium text-[13px] whitespace-nowrap shrink-0">{displayName}</span>
              {span.preview && (
                <span className="text-[13px] text-secondary-foreground truncate min-w-0">{span.preview}</span>
              )}
            </div>
          )}

          <div className="flex items-center shrink-0 ml-auto">
            <SpanStats span={span} />
          </div>
        </div>

        {isLLM && span.preview && <PreviewText text={span.preview} className="pl-7" />}
      </div>
    </div>
  );
};

export default memo(SpanRow);
