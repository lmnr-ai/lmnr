import { ChartArea, type LucideIcon } from "lucide-react";

interface ChartEmptyStateProps {
  title: string;
  hint?: string;
  icon?: LucideIcon;
}

/** Centered placeholder shown in place of a chart — no data, or not enough config to draw one. */
const ChartEmptyState = ({ title, hint, icon: Icon = ChartArea }: ChartEmptyStateProps) => (
  <div className="flex flex-1 h-full w-full flex-col items-center justify-center gap-1.5 px-4 text-center">
    <Icon className="size-6 text-muted-foreground/60" />
    <span className="text-sm font-medium text-secondary-foreground">{title}</span>
    {hint && <span className="max-w-xs text-xs text-muted-foreground">{hint}</span>}
  </div>
);

export default ChartEmptyState;
