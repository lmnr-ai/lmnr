import { TooltipContent } from "@/components/ui/tooltip";

interface Props {
  f1Score: number;
  tracesPerDollar: number;
}

const ModelTooltipContent = ({ f1Score, tracesPerDollar }: Props) => (
  <TooltipContent className="max-w-64 bg-surface-up-4 px-2 py-1 font-sans-landing">
    <div className="flex items-center justify-between gap-6">
      <span className="text-secondary-foreground">F1 score (%)</span>
      <span className="text-primary-foreground tabular-nums">{f1Score}%</span>
    </div>
    <div className="flex items-center justify-between gap-6">
      <span className="text-secondary-foreground">Traces analyzed per dollar</span>
      <span className="text-primary-foreground tabular-nums">{tracesPerDollar.toLocaleString()}</span>
    </div>
  </TooltipContent>
);

export default ModelTooltipContent;
