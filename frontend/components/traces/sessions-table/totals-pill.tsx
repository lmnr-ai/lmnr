import { CircleDollarSign, Clock3, Coins } from "lucide-react";

const compactNumberFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

function formatDuration(durationSec: number): string {
  if (durationSec < 0.01) return "0s";
  if (durationSec < 100) return `${durationSec.toFixed(2)}s`;
  if (durationSec < 1000) return `${durationSec.toFixed(1)}s`;
  return `${Math.round(durationSec)}s`;
}

interface TotalsPillProps {
  duration: number;
  totalTokens: number;
  totalCost: number;
}

export default function TotalsPill({ duration, totalTokens, totalCost }: TotalsPillProps) {
  return (
    <div className="bg-[#222226] flex gap-2 h-5 items-center overflow-clip px-1.5 rounded-md shrink-0">
      <div className="flex gap-1 h-4 items-center">
        <Clock3 size={12} className="shrink-0 text-secondary-foreground" />
        <span className="font-mono text-xs text-secondary-foreground whitespace-nowrap leading-4">
          {formatDuration(duration ?? 0)}
        </span>
      </div>
      <div className="flex gap-1 h-4 items-center">
        <Coins size={12} className="shrink-0 text-secondary-foreground" />
        <span className="font-mono text-xs text-secondary-foreground whitespace-nowrap leading-4">
          {compactNumberFormat.format(totalTokens ?? 0)}
        </span>
      </div>
      <div className="flex gap-1 h-4 items-center">
        <CircleDollarSign size={12} className="shrink-0 text-secondary-foreground" />
        <span className="font-mono text-xs text-secondary-foreground whitespace-nowrap leading-4">
          {(totalCost ?? 0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}
