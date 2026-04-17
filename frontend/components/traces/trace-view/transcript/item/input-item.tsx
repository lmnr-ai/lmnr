import { ArrowRight } from "lucide-react";

import { PreviewLoadingPlaceholder } from "@/components/traces/trace-view/preview-loading-placeholder.tsx";
import { CollapsedTextWithMore } from "@/components/traces/trace-view/transcript/collapsed-text-with-more";
import { cn } from "@/lib/utils.ts";

interface InputItemProps {
  text: string | null;
  isLoading: boolean;
  inGroup?: boolean;
}

export function InputItem({ text, isLoading, inGroup }: InputItemProps) {
  if (!isLoading && !text) return null;

  return (
    <div
      className={cn("flex flex-col flex-1 min-w-0 py-2 px-1 border-l-4 border-l-transparent gap-1", {
        "bg-muted/60": inGroup,
      })}
    >
      <div className="flex gap-2 items-center min-w-0">
        <div className="flex items-center justify-center z-10 rounded shrink-0 bg-blue-400/70 w-5 h-5 min-w-5 min-h-5">
          <ArrowRight size={14} />
        </div>
        <span className="font-medium text-sm whitespace-nowrap shrink-0">Input</span>
      </div>
      <div className="pl-7">
        {isLoading ? <PreviewLoadingPlaceholder /> : <CollapsedTextWithMore text={text!} lineHeight={17} />}
      </div>
    </div>
  );
}
