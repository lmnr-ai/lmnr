import { ChevronDown, ChevronRight, MessageCircle } from "lucide-react";
import Skeleton from "./Skeleton";

interface LLMStepProps {
  expanded?: boolean;
  content?: string;
}

const LLMStep = ({ expanded, content }: LLMStepProps) => (
  <>
    <div className="flex h-7 items-center px-3 w-full shrink-0">
      <div className="flex gap-2 items-center">
        {expanded ? (
          <ChevronDown className="w-2.5 h-2.5 text-landing-text-500" />
        ) : (
          <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
        )}
        <div className="bg-[rgba(116,63,227,0.3)] flex items-center p-1 rounded">
          <MessageCircle className="w-3 h-3 text-landing-text-500" />
        </div>
        <div className="relative">
          <p className="text-landing-text-500 text-xs opacity-[var(--text-opacity)]">gpt-05-nano-2025-08-07</p>
          <Skeleton width="w-40" className="absolute top-1/2 left-0 -translate-y-1/2" />
        </div>
      </div>
    </div>
    {expanded && content && (
      <div className="flex items-start justify-between max-h-[60px] overflow-hidden pb-2 pl-[58px] pr-2 w-full shrink-0">
        <div className="relative flex-1">
          <p className="text-landing-text-500 text-xs leading-normal opacity-[var(--text-opacity)]">{content}</p>
          <div className="absolute top-0 left-0 flex flex-col gap-1 opacity-[var(--skeleton-opacity)]">
            <div className="h-2 bg-landing-surface-500 w-64" />
            <div className="h-2 bg-landing-surface-500 w-56" />
          </div>
        </div>
      </div>
    )}
  </>
);

export default LLMStep;
