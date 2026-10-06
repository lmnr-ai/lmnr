import { formatDay, COMPRESSED_LABEL } from "@/components/workspace/usage/utils";
import { type DailyPoint } from "@/lib/billing/usage-estimate";

interface UsageTooltipProps {
  active?: boolean;
  payload?: { payload: DailyPoint }[];
  format: (value: number) => string;
}

export default function UsageTooltip({ active, payload, format }: UsageTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point || point.value == null || point.total == null) return null;

  const compressed = point.compressed ?? 0;
  const compressedPercent = compressed > 0 ? Math.round((compressed / (point.value + compressed)) * 100) : 0;

  return (
    <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md flex flex-col gap-1 min-w-40">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-muted-foreground">{formatDay(point.date)}</span>
        <span className="text-sm font-medium tabular-nums">{format(point.value)}</span>
      </div>
      {compressedPercent > 0 && <Row label={COMPRESSED_LABEL} value={`${compressedPercent}%`} />}
      <Row label="Total to date" value={format(point.total)} />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
