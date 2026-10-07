import SpanTypeIcon from "@/components/traces/span-type-icon.tsx";
import { CollapsedTextWithMore } from "@/components/traces/trace-view/transcript/collapsed-text-with-more";
import { SpanType } from "@/lib/traces/types.ts";
import { cn } from "@/lib/utils.ts";

interface OutputItemProps {
  text: string | null;
  isLoading: boolean;
  inGroup?: boolean;
  className?: string;
}

export function OutputItem({ text, inGroup, className }: OutputItemProps) {
  if (!text) return null;

  return (
    <div className="flex">
      <div
        className={cn(
          "flex flex-col flex-1 min-w-0 py-2 pr-2 border-l-4 border-l-transparent gap-1",
          {
            "bg-muted/60": inGroup,
          },
          "pl-1",
          className
        )}
      >
        <div className="flex gap-2 items-center min-w-0">
          <SpanTypeIcon size={14} containerWidth={20} containerHeight={20} spanType={SpanType.LLM} />
          <span className="font-medium text-sm whitespace-nowrap shrink-0">Output</span>
        </div>
        <div className="pl-7">
          <CollapsedTextWithMore text={text} lineHeight={17} />
        </div>
      </div>
    </div>
  );
}
