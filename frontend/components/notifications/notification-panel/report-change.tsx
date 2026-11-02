import { cn } from "@/lib/utils";

// Same NEW / ▲ / ▼ markers and colors as the email report: growth is red, decline green.
export const ReportChange = ({ current, previous }: { current: number; previous: number }) => {
  if (previous === 0) {
    return <span className="text-[10px] font-medium text-muted-foreground uppercase">New</span>;
  }
  const pct = ((current - previous) / previous) * 100;
  if (pct === 0) {
    return <span className="text-[11px] text-muted-foreground">0.0%</span>;
  }
  return (
    <span className={cn("text-[11px]", pct > 0 ? "text-destructive-text" : "text-success-text")}>
      {pct > 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
};
