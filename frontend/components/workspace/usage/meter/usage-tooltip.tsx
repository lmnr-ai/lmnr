import { formatDay } from "@/components/workspace/usage/utils";
import { type DailyPoint } from "@/lib/billing/usage-estimate";

interface UsageTooltipProps {
  active?: boolean;
  payload?: { payload: DailyPoint }[];
  format: (value: number) => string;
}

export default function UsageTooltip({ active, payload, format }: UsageTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point || point.value == null || point.total == null) return null;

  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md flex flex-col gap-1 min-w-40">
      <span className="font-medium">{formatDay(point.date)}</span>
      <Row label="Used that day" value={format(point.value)} />
      <Row label="Total to date" value={format(point.total)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
