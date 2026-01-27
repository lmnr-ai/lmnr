import { Bolt, ChevronRight } from "lucide-react";

import Skeleton from "./skeleton";

interface BoltStepProps {
  text: string;
}

const BoltStep = ({ text }: BoltStepProps) => (
  <div className="border-b border-landing-surface-400 flex h-7 items-center px-3 w-full shrink-0">
    <div className="flex gap-2 items-center">
      <ChevronRight className="w-2.5 h-2.5 text-landing-text-500" />
      <div className="bg-[rgba(196,148,52,0.3)] flex items-center p-1 rounded">
        <Bolt className="w-3 h-3 text-landing-text-500" />
      </div>
      <div className="relative">
        <p className="text-landing-text-500 text-xs opacity-[var(--text-opacity)]">{text}</p>
        <Skeleton width="w-48" className="absolute top-1/2 left-0 -translate-y-1/2" />
      </div>
    </div>
  </div>
);

export default BoltStep;
