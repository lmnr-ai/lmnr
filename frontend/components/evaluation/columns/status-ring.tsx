import { cn } from "@/lib/utils";

const SIZE = 14;
const STROKE = 1.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface StatusRingProps {
  succeeded: number;
  failed: number;
}

/** Donut split into succeeded (green) and failed (red) arcs, clockwise from 12 o'clock. */
export const StatusRing = ({ succeeded, failed }: StatusRingProps) => {
  const total = succeeded + failed;
  const segments = [
    { count: succeeded, className: "text-success-text" },
    { count: failed, className: "text-destructive-text" },
  ];

  let offset = 0;
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="shrink-0 -rotate-90">
      {segments.map(({ count, className }) => {
        if (count === 0) return null;
        const length = (count / total) * CIRCUMFERENCE;
        const arc = (
          <circle
            key={className}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
            strokeDashoffset={-offset}
            className={cn(className)}
          />
        );
        offset += length;
        return arc;
      })}
    </svg>
  );
};
