import { LogIn } from "lucide-react";

import { CollapsedTextWithMore } from "@/components/traces/trace-view/list/collapsed-text-with-more";
import { PreviewLoadingPlaceholder } from "@/components/traces/trace-view/preview-loading-placeholder.tsx";

interface InputItemProps {
  text: string | null;
  isLoading: boolean;
}

export function InputItem({ text, isLoading }: InputItemProps) {
  if (!isLoading && !text) return null;

  return (
    <div className="flex flex-col flex-1 min-w-0 px-3 py-2 border-l-4 border-l-transparent gap-1">
      <div className="flex gap-2 items-center min-w-0">
        <div className="flex items-center justify-center z-10 rounded shrink-0 bg-blue-400/70 w-5 h-5 min-w-5 min-h-5">
          <LogIn size={14} />
        </div>
        <span className="font-medium text-sm whitespace-nowrap shrink-0">Input</span>
      </div>
      <div className="pl-7">
        {isLoading ? <PreviewLoadingPlaceholder /> : <CollapsedTextWithMore text={text!} lineHeight={17} />}
      </div>
    </div>
  );
}
