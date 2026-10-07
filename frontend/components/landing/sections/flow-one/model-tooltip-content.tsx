import { TooltipContent } from "@/components/ui/tooltip";

interface Props {
  descF1: number;
  tracesPerDollar: number;
}

const ModelTooltipContent = ({ descF1, tracesPerDollar }: Props) => (
  <TooltipContent className="max-w-64 bg-surface-up-4 px-2 py-1 font-sans-landing">
    <div className="flex items-center justify-between gap-6">
      <span className="text-secondary-foreground">Trace analysis intelligence (%)</span>
      <span className="text-primary-foreground tabular-nums">{descF1}%</span>
    </div>
    <div className="flex items-center justify-between gap-6">
      <span className="text-secondary-foreground">Traces analyzed per dollar</span>
      <span className="text-primary-foreground tabular-nums">{tracesPerDollar.toLocaleString()}</span>
    </div>
  </TooltipContent>
);

export default ModelTooltipContent;
